import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
const directory = fileURLToPath(new URL(".", import.meta.url));

test("evidence migration and daily scoring run in isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
    `);
    const migrations = path.join(directory, "../supabase/migrations");
    const legacyUser = randomUUID();
    for (const name of readdirSync(migrations).filter((name) => name.endsWith(".sql") && !name.includes("schedule_check_in") && !name.includes("immediate_check_in") && !name.includes("check_in_progress_and_xp")).sort()) {
      if (name.includes("20261007000000")) {
        await db.query("insert into auth.users(id) values ($1)", [legacyUser]);
        await db.query("update stat_subscores set value=42 where user_id=$1 and substat_id='fitness'", [legacyUser]);
        await db.query("insert into ai_check_ins(user_id,content,summary,adjustments) values ($1,'Legacy entry','Legacy summary','[]')", [legacyUser]);
        await db.query("insert into qol_scores(user_id,score) values ($1,60)", [legacyUser]);
      }
      await db.exec(readFileSync(path.join(migrations, name), "utf8"));
    }
    await t.test("migration preserves legacy scores, check-ins and QoL history", async () => {
      assert.equal((await db.query("select value::float8 as value from stat_subscores where user_id=$1 and substat_id='fitness'", [legacyUser])).rows[0].value, 42);
      assert.equal((await db.query("select content,session_id from ai_check_ins where user_id=$1", [legacyUser])).rows[0].session_id, null);
      assert.equal((await db.query("select score from qol_scores where user_id=$1", [legacyUser])).rows[0].score, 60);
    });
    await t.test("local-day closure includes grace period and US daylight-saving boundaries", async () => {
      for (const [day, timestamp, expected] of [
        ["2026-10-02", "2026-10-03T04:04:59Z", false],
        ["2026-10-02", "2026-10-03T04:05:00Z", true],
        ["2026-03-08", "2026-03-09T04:05:00Z", true],
        ["2026-11-01", "2026-11-02T05:04:59Z", false],
        ["2026-11-01", "2026-11-02T05:05:00Z", true],
      ]) {
        const result = await db.query("select check_in_day_is_closed($1::date,'America/New_York',$2::timestamptz) as closed", [day, timestamp]);
        assert.equal(result.rows[0].closed, expected);
      }
    });
    const user = randomUUID();
    const otherUser = randomUUID();
    const session = randomUUID();
    await db.query("insert into auth.users(id) values ($1), ($2)", [user, otherUser]);
    await db.query("update public.stat_subscores set value = 50 where user_id = $1", [user]);
    const evidence = (key, direction = "positive", overrides = {}) => ({
      substat_id: "fitness", source_quote: "walk", observation: "Completed a walk",
      activity_key: key, direction, proposed_gain: direction === "positive" ? 1 : null, time_reference: "today", confidence: 0.9, linked_quest_id: null, ...overrides,
    });
    const analysis = (items, overrides = {}) => ({
      schema_version: "2", language_status: "english", normalized_english: "Today I took a walk.",
      evidence: items, acknowledgement: "You made time for movement.", practical_tip: null, follow_up_question: null, confidence: 0.9, safety_flags: [], ...overrides,
    });
    async function save(items, { request = randomUUID(), sessionId = session, owner = user, timezone = "America/New_York", overrides = {} } = {}) {
      const result = await db.query("select public.save_check_in_evidence($1,$2,$3,$4,$5,now(),$6::jsonb,$7) as result",
        [owner, sessionId, request, "Today I took a walk.", timezone, JSON.stringify(analysis(items, overrides)), "synthetic/model"]);
      return result.rows[0].result;
    }
    await t.test("saving is atomic, provisional and retry-idempotent", async () => {
      const request = randomUUID();
      const first = await save([evidence("walk")], { request });
      const second = await save([evidence("walk")], { request });
      assert.equal(first.entry_id, second.entry_id);
      assert.equal(first.session_indicators[0].pending_change, 1);
      assert.equal((await db.query("select value::float8 as value from stat_subscores where user_id=$1 and substat_id='fitness'", [user])).rows[0].value, 50);
      assert.equal((await db.query("select count(*)::int as count from check_in_evidence")).rows[0].count, 1);
      await assert.rejects(db.query("select public.save_check_in_evidence($1,$2,$3,$4,$5,now(),$6::jsonb,$7)", [user, session, request, "Different text.", "America/New_York", JSON.stringify(analysis([])), "synthetic/model"]), /different content/);
      await assert.rejects(save([evidence("bad", "positive", { substat_id: "bogus" })]), /Invalid evidence/);
      assert.equal((await db.query("select count(*)::int as count from ai_check_ins where session_id is not null")).rows[0].count, 1);
    });
    await t.test("deduplicates repeated activities, caps gains at +5 and never deducts", async () => {
      await save([evidence("walk"), evidence("run"), evidence("swim"), evidence("cycle"), evidence("row")]);
      const result = await save(Array.from({ length: 5 }, (_, index) => evidence(`negative_${index}`, "negative", { substat_id: "spending" })));
      assert.equal(result.session_indicators.find((i) => i.substat_id === "fitness").pending_change, 5);
      assert.equal(result.session_indicators.find((i) => i.substat_id === "spending").pending_change, 0);
      const decimal = await save([evidence("sleep_one", "positive", { substat_id: "nutrition", proposed_gain: 1.25 }), evidence("sleep_two", "positive", { substat_id: "nutrition", proposed_gain: 2.5 })]);
      assert.equal(decimal.session_indicators.find((i) => i.substat_id === "nutrition").pending_change, 3.75);
      const repeat = await save([evidence("sleep_one", "positive", { substat_id: "nutrition", proposed_gain: 5 })]);
      assert.equal(repeat.session_indicators.find((i) => i.substat_id === "nutrition").pending_change, 3.75);
      const otherSession = await save([evidence("fitness_from_other_session", "positive", { proposed_gain: 2.75 })], { sessionId: randomUUID() });
      assert.equal(otherSession.session_indicators.find((i) => i.substat_id === "fitness").pending_change, 5);
      await db.query("insert into xp_log(user_id,amount,source) values ($1,7,'Historical XP')", [legacyUser]);
    });
    await t.test("excludes unsafe, planned, historical and low-confidence evidence", async () => {
      await save([evidence("unsafe", "positive", { substat_id: "sleep" })], { overrides: { safety_flags: ["unsafe_behavior"] } });
      await save([evidence("low", "positive", { substat_id: "sleep", confidence: 0.79 }), evidence("plan", "positive", { substat_id: "sleep", time_reference: "planned" }), evidence("past", "positive", { substat_id: "sleep", time_reference: "historical" })]);
      const result = await save([]);
      assert.equal(result.session_indicators.some((i) => i.substat_id === "sleep"), false);
      const reasons = (await db.query("select exclusion_reason from check_in_evidence where substat_id='sleep'")).rows.map((r) => r.exclusion_reason).sort();
      assert.deepEqual(reasons, ["historical", "low_confidence", "planned", "safety"]);
    });
    await t.test("rejects foreign sessions, invalid evidence and timezone changes", async () => {
      await assert.rejects(save([], { owner: otherUser }), /another user/);
      await assert.rejects(save([], { timezone: "UTC", sessionId: randomUUID() }), /timezone differs/);
      await assert.rejects(save([evidence("invented", "positive", { source_quote: "ran" })]), /Invalid evidence/);
      await assert.rejects(save([evidence("walk", "positive", { linked_quest_id: randomUUID() })]), /Invalid linked quest/);
      for (const gain of [0.99, 5.01, -1, null]) {
        await assert.rejects(save([evidence("bad_gain", "positive", { proposed_gain: gain })]), /Invalid proposed gain/);
      }
    });
    await t.test("completed quests are not awarded again, even if completed after extraction", async () => {
      const quest = randomUUID();
      await db.query("insert into quests(id,user_id,title,tag,substat_id,is_completed,completed_at) values ($1,$2,'call_family','social','family',true,now())", [quest, user]);
      await db.query("insert into quest_completions(quest_id,user_id,completed_on,xp_awarded,stat_gain) values ($1,$2,current_date,10,1)", [quest, user]);
      await save([evidence("family", "positive", { substat_id: "family", linked_quest_id: quest })]);
      const result = await save([evidence("call_family", "positive", { substat_id: "family" })]);
      assert.equal(result.session_indicators.some((i) => i.substat_id === "family"), false);
    });
    await t.test("no aggregation before local day closes; closed days update once with provenance", async () => {
      assert.equal((await db.query("select aggregate_due_check_ins() as count")).rows[0].count, 0);
      // Move synthetic data to a closed day; real saves only accept current server timestamps.
      await db.exec("update ai_check_ins set local_day=current_date-2 where session_id is not null; update check_in_evidence set local_day=current_date-2; update quest_completions set completed_at=completed_at-interval '2 days';");
      assert.equal((await db.query("select aggregate_due_check_ins() as count")).rows[0].count, 1);
      const scores = (await db.query("select substat_id,value::float8 as value from stat_subscores where user_id=$1", [user])).rows;
      assert.equal(scores.find((s) => s.substat_id === "fitness").value, 55);
      assert.equal(scores.find((s) => s.substat_id === "spending").value, 50);
      assert.equal(scores.find((s) => s.substat_id === "nutrition").value, 53.75);
      assert.equal(scores.find((s) => s.substat_id === "sleep").value, 50);
      assert.equal((await db.query("select count(*)::int as count from check_in_daily_scores")).rows[0].count, 3);
      assert.equal((await db.query("select count(*)::int as count from xp_log where user_id=$1", [user])).rows[0].count, 0);
      assert.equal((await db.query("select aggregate_due_check_ins() as count")).rows[0].count, 0);
      assert.equal((await db.query("select count(*)::int as count from stat_progress_events")).rows[0].count > 0, true);
    });
    await t.test("conflicting reports are neutral; decimal scores clamp at 100; negative evidence does not deduct", async () => {
      await db.query("update stat_subscores set value=case when substat_id='fitness' then 99 when substat_id='spending' then 1 else value end where user_id=$1", [user]);
      await save([evidence("conflict"), evidence("conflict", "negative"), evidence("fitness_positive", "positive", { proposed_gain: 2.5 }), evidence("spending_negative", "negative", { substat_id: "spending" }), evidence("spending_negative_two", "negative", { substat_id: "spending" }), evidence("spirituality", "positive", { substat_id: "spirituality" })]);
      await db.query("update lifestats_settings set spirituality_enabled=false where user_id=$1", [user]);
      await db.exec("update ai_check_ins set local_day=current_date-1 where aggregated_at is null; update check_in_evidence set local_day=current_date-1 where local_day<>current_date-2;");
      await db.query("select aggregate_due_check_ins()");
      const ledger = (await db.query("select substat_id,requested_change::float8 as requested_change,applied_change::float8 as applied_change,value::float8 as value from check_in_daily_scores where local_day=current_date-1")).rows;
      assert.deepEqual(ledger.find((r) => r.substat_id === "fitness"), { substat_id: "fitness", requested_change: 2.5, applied_change: 1, value: 100 });
      assert.deepEqual(ledger.find((r) => r.substat_id === "spending"), { substat_id: "spending", requested_change: 0, applied_change: 0, value: 1 });
      assert.equal(ledger.some((r) => r.substat_id === "spirituality"), false);
    });
    await t.test("only daily habits award XP; one-time quests keep stat gains and existing XP is preserved", async () => {
      const habit = randomUUID(), quest = randomUUID();
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.query("insert into quests(id,user_id,title,tag,substat_id,is_daily,xp_value) values ($1,$3,'Daily focus','discipline','focus',true,20),($2,$3,'One-time focus','discipline','focus',false,20)", [habit, quest, user]);
      const completedQuest = (await db.query("select * from complete_quest($1)", [quest])).rows[0];
      assert.equal(completedQuest.xp_awarded, 0);
      assert.equal(completedQuest.stat_gain, 2);
      assert.equal((await db.query("select count(*)::int as count from xp_log where user_id=$1", [user])).rows[0].count, 0);
      const completedHabit = (await db.query("select * from complete_quest($1)", [habit])).rows[0];
      assert.equal(completedHabit.xp_awarded, 20);
      assert.equal(completedHabit.stat_gain, 2);
      assert.equal((await db.query("select sum(amount)::int as total from xp_log where user_id=$1", [user])).rows[0].total, 20);
      assert.equal((await db.query("select sum(amount)::int as total from xp_log where user_id=$1", [legacyUser])).rows[0].total, 7);
      await assert.rejects(db.query("select * from complete_quest($1)", [habit]), /already been completed/);
      assert.equal((await db.query("select sum(amount)::int as total from xp_log where user_id=$1", [user])).rows[0].total, 20);
    });
    await t.test("browser roles cannot write AI evidence, invoke scoring or read other users", async () => {
      assert.equal((await db.query("select has_function_privilege('authenticated','public.save_check_in_evidence(uuid,uuid,uuid,text,text,timestamptz,jsonb,text)','execute') as allowed")).rows[0].allowed, false);
      assert.equal((await db.query("select has_function_privilege('authenticated','public.aggregate_due_check_ins()','execute') as allowed")).rows[0].allowed, false);
      assert.equal((await db.query("select has_function_privilege('authenticated','public.apply_ai_check_in(text,text,jsonb,integer)','execute') as allowed")).rows[0].allowed, false);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [otherUser]);
      await db.exec("set role authenticated");
      assert.equal((await db.query("select count(*)::int as count from check_in_evidence")).rows[0].count, 0);
      await assert.rejects(db.exec("insert into check_in_sessions(id,user_id,timezone) values (gen_random_uuid(),gen_random_uuid(),'UTC')"), /permission denied/);
      await assert.rejects(db.exec("update lifestats_settings set check_in_timezone='UTC'"), /permission denied/);
      await db.query("insert into lifestats_settings(user_id,spirituality_enabled,include_spirituality_in_life_score) values ($1,true,false) on conflict(user_id) do update set spirituality_enabled=excluded.spirituality_enabled", [otherUser]);
      await db.exec("reset role");
    });
    await t.test("immediate migration catches up evidence, applies only remaining allowance, and is retry-safe", async () => {
      const instantUser = randomUUID(), instantSession = randomUUID();
      await db.query("insert into auth.users(id) values ($1)", [instantUser]);
      await db.query("update stat_subscores set value=50 where user_id=$1", [instantUser]);
      const firstRequest = randomUUID();
      await save([evidence("first", "positive", { proposed_gain: 1.25 })], { owner: instantUser, sessionId: instantSession, request: firstRequest });
      await db.exec(readFileSync(path.join(migrations, "20261010000000_immediate_check_in_scores.sql"), "utf8"));
      const fitness = async () => (await db.query("select value::float8 as value from stat_subscores where user_id=$1 and substat_id='fitness'", [instantUser])).rows[0].value;
      assert.equal(await fitness(), 51.25);
      const retry = await save([evidence("first", "positive", { proposed_gain: 1.25 })], { owner: instantUser, sessionId: instantSession, request: firstRequest });
      assert.equal(await fitness(), 51.25);
      assert.equal(retry.scoring_mode, "immediate");
      assert.equal(retry.daily_scores[0].applied_change, 1.25);
      await save([evidence("first", "positive", { proposed_gain: 5 })], { owner: instantUser, sessionId: instantSession });
      assert.equal(await fitness(), 51.25);
      const more = await save([evidence("second", "positive", { proposed_gain: 2.5 })], { owner: instantUser, sessionId: instantSession });
      assert.equal(await fitness(), 53.75);
      assert.equal(more.daily_scores[0].daily_allowance_used, 3.75);
      await save([evidence("third", "positive", { proposed_gain: 5 })], { owner: instantUser, sessionId: randomUUID() });
      assert.equal(await fitness(), 55);
      await save([evidence("fourth", "positive", { proposed_gain: 5 })], { owner: instantUser, sessionId: instantSession });
      assert.equal(await fitness(), 55);
      await save([evidence("first", "negative")], { owner: instantUser, sessionId: instantSession });
      assert.equal(await fitness(), 55);
      await assert.rejects(save([evidence("bad", "positive", { proposed_gain: 6 })], { owner: instantUser, sessionId: instantSession }));
      assert.equal(await fitness(), 55);
      assert.equal((await db.query("select count(*)::int as count from xp_log where user_id=$1", [instantUser])).rows[0].count, 0);
      // Close the synthetic day along with its ledger; closure must not re-award gains.
      await db.query("update ai_check_ins set local_day=current_date-3 where user_id=$1", [instantUser]);
      await db.query("update check_in_evidence set local_day=current_date-3 where user_id=$1", [instantUser]);
      await db.query("update check_in_daily_scores set local_day=current_date-3 where user_id=$1", [instantUser]);
      assert.equal((await db.query("select aggregate_due_check_ins() as count")).rows[0].count, 1);
      assert.equal(await fitness(), 55);
      assert.equal((await db.query("select aggregate_due_check_ins() as count")).rows[0].count, 0);
      assert.equal((await db.query("select has_function_privilege('authenticated','public.apply_check_in_day_gains(uuid,date)','execute') as allowed")).rows[0].allowed, false);
      assert.equal((await db.query("select has_function_privilege('service_role','public.save_check_in_evidence_internal(uuid,uuid,uuid,text,text,timestamptz,jsonb,text)','execute') as allowed")).rows[0].allowed, false);
    });
    await t.test("small gains persist across reads even when the rounded dashboard base score stays zero", async () => {
      const owner = randomUUID(), sessionId = randomUUID();
      await db.query("insert into auth.users(id) values ($1)", [owner]);
      const saved = await save([evidence("walk", "positive", { proposed_gain: 2 })], { owner, sessionId });
      assert.equal(saved.daily_scores[0].applied_change, 2);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      await db.exec("set role authenticated");
      assert.equal((await db.query("select value::float8 as value from stat_subscores where substat_id='fitness'")).rows[0].value, 2);
      assert.equal((await db.query("select value from stats where stat_name='vitality'")).rows[0].value, 0);
      assert.equal((await db.query("select id,content from ai_check_ins")).rows[0].id, saved.entry_id);
      assert.equal((await db.query("select id,content from ai_check_ins")).rows[0].content, "Today I took a walk.");
      await db.exec("reset role");
      const restored = (await db.query("select get_check_in_result($1,$2) as result", [owner, saved.entry_id])).rows[0].result;
      assert.equal(restored.entry_id, saved.entry_id);
      assert.equal(restored.daily_scores[0].applied_change, 2);
    });
    await t.test("per-entry category gains and XP preserve decimals and retries without reusing daily totals", async () => {
      await db.exec(readFileSync(path.join(migrations, "20261011000000_check_in_progress_and_xp.sql"), "utf8"));
      assert.equal((await db.query("select count(*)::int as count from ai_check_ins where category_gains is not null")).rows[0].count, 0);
      assert.equal((await db.query("select sum(amount) as total from xp_log where check_in_day is not null")).rows[0].total,
        (await db.query("select sum(applied_change) as total from check_in_daily_scores")).rows[0].total);
      const owner = randomUUID(), sessionId = randomUUID(), request = randomUUID();
      await db.query("insert into auth.users(id) values ($1)", [owner]);
      const gains = async (id) => (await db.query("select category_gains from ai_check_ins where id=$1", [id])).rows[0].category_gains;
      const xp = async () => (await db.query("select coalesce(sum(amount),0)::float8 as total from xp_log where user_id=$1", [owner])).rows[0].total;
      const first = await save([evidence("run", "positive", { proposed_gain: 2 })], { owner, sessionId, request });
      const firstGains = await gains(first.entry_id);
      assert.equal(firstGains.vitality, 2);
      assert.equal(await xp(), 2);
      assert.equal(firstGains.social, 0);
      const retry = await save([evidence("run", "positive", { proposed_gain: 2 })], { owner, sessionId, request });
      assert.equal(retry.entry_id, first.entry_id);
      assert.deepEqual(await gains(retry.entry_id), firstGains);
      assert.equal(await xp(), 2);
      const repeat = await save([evidence("run", "positive", { proposed_gain: 5 })], { owner, sessionId });
      assert.equal((await gains(repeat.entry_id)).vitality, 0);
      assert.equal(repeat.daily_scores[0].applied_change, 2);
      assert.equal(await xp(), 2);
      const second = await save([evidence("swim", "positive", { proposed_gain: 5 }), evidence("call", "positive", { substat_id: "friends", proposed_gain: 2 })], { owner, sessionId });
      assert.equal((await gains(second.entry_id)).vitality, 3);
      assert.equal((await gains(second.entry_id)).social, 2);
      assert.equal(await xp(), 7);
      const empty = await save([], { owner, sessionId });
      assert.equal((await gains(empty.entry_id)).vitality, 0);
      assert.equal((await gains(empty.entry_id)).social, 0);
      await db.query("update stat_subscores set value=99.5 where user_id=$1 and substat_id='nutrition'", [owner]);
      const clamped = await save([evidence("meal", "positive", { substat_id: "nutrition", proposed_gain: 2 })], { owner, sessionId });
      assert.equal((await gains(clamped.entry_id)).vitality, 0.5);
      assert.equal(await xp(), 7.5);
      const beforeInvalid = (await db.query("select count(*)::int as count from ai_check_ins")).rows[0].count;
      await assert.rejects(save([evidence("invalid", "positive", { proposed_gain: 6 })], { owner, sessionId }));
      assert.equal((await db.query("select count(*)::int as count from ai_check_ins")).rows[0].count, beforeInvalid);
      assert.equal(await xp(), 7.5);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      const habit = randomUUID();
      await db.query("insert into quests(id,user_id,title,tag,substat_id,is_daily,xp_value) values ($1,$2,'Daily focus','discipline','focus',true,20)", [habit, owner]);
      const completed = (await db.query("select * from complete_quest($1)", [habit])).rows[0];
      assert.equal(completed.xp_awarded, 20);
      assert.equal(Number(completed.total_xp), 27.5);
      assert.equal(await xp(), 27.5);
      assert.equal(Number((await db.query("select * from get_my_character_progress()")).rows[0].total_xp), 27.5);
      // Closing the day updates the same XP identity, never issuing another award.
      await db.query("update ai_check_ins set local_day=current_date-4 where user_id=$1", [owner]);
      await db.query("update check_in_evidence set local_day=current_date-4 where user_id=$1", [owner]);
      await db.query("update check_in_daily_scores set local_day=current_date-4 where user_id=$1", [owner]);
      await db.query("update xp_log set check_in_day=current_date-4 where user_id=$1 and check_in_day is not null", [owner]);
      await db.query("select aggregate_due_check_ins()");
      assert.equal(await xp(), 27.5);
      assert.equal((await db.query("select has_function_privilege('service_role','public.save_check_in_evidence_scored(uuid,uuid,uuid,text,text,timestamptz,jsonb,text)','execute') as allowed")).rows[0].allowed, false);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [otherUser]);
      await db.exec("set role authenticated");
      assert.equal((await db.query("select count(*)::int as count from ai_check_ins where user_id=$1", [owner])).rows[0].count, 0);
      await db.exec("reset role");
    });
    await t.test("saved numeric XP crosses the 100 XP boundary consistently in the progress RPC", async () => {
      const owner = randomUUID();
      await db.query("insert into auth.users(id) values ($1)", [owner]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      await db.query("insert into xp_log(user_id,amount,source) values ($1,99.99,'Synthetic threshold test')", [owner]);
      assert.equal((await db.query("select * from get_my_character_progress()")).rows[0].level, 0);
      await db.query("insert into xp_log(user_id,amount,source) values ($1,0.01,'Synthetic threshold test')", [owner]);
      const progress = (await db.query("select * from get_my_character_progress()")).rows[0];
      assert.equal(progress.level, 1);
      assert.equal(Number(progress.total_xp), 100);
      assert.equal(Number(progress.xp_into_current_level), 0);
    });
  } finally {
    await db.close();
  }
});
