import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const compiled = async (name) => (await import(pathToFileURL(path.join(process.env.CHECK_IN_BUILD_DIR, `lib/check-in/${name}.js`)))).default;
const analysisModule = await compiled("analysis");
const providerModule = await compiled("perplexity");
const credentials = (await import(pathToFileURL(path.join(process.env.CHECK_IN_BUILD_DIR, "lib/supabase/credentials.js")))).default;
const constants = (await import(pathToFileURL(path.join(process.env.CHECK_IN_BUILD_DIR, "lib/constants.js")))).default;
const userName = (await import(pathToFileURL(path.join(process.env.CHECK_IN_BUILD_DIR, "lib/user-name.js")))).default;
const routeCode = ts.transpileModule(readFileSync(new URL("../app/api/check-in/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const user = randomUUID();
const content = "Today I took a walk.";
const input = () => ({
  content, session_id: randomUUID(), request_id: randomUUID(), locale: "en-US",
  timezone: "America/New_York", consent_version: "perplexity-text-v1",
});
const analysis = () => ({
  schema_version: "2", language_status: "english", normalized_english: content,
  evidence: [{ substat_id: "fitness", source_quote: "walk", observation: "Completed a walk", activity_key: "walk", direction: "positive", proposed_gain: 1, time_reference: "today", confidence: 0.9, linked_quest_id: null }],
  acknowledgement: "You made time for movement.", practical_tip: null, follow_up_question: null, confidence: 0.9, safety_flags: [],
});

function loadRoute(options = {}) {
  const calls = { provider: [], rpc: [], logs: [], filters: [] };
  const env = {
    PERPLEXITY_API_KEY: "synthetic-key", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic-test",
    PERPLEXITY_CHECK_INS_ENABLED: "true", PERPLEXITY_MODEL: "synthetic/model", ...options.env,
  };
  const responseFor = (table) => {
    if (table === "ai_check_ins") return { data: options.existing ?? null, error: options.historyError ?? null };
    if (table === "check_in_sessions") return { data: { timezone: "America/New_York" }, error: null };
    if (table === "lifestats_settings") return { data: { spirituality_enabled: false, check_in_timezone: "America/New_York" }, error: null };
    return { data: [], error: null };
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: options.unauthenticated ? null : { id: user, user_metadata: { first_name: "Ada", last_name: "Lovelace" } } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; },
        eq(column, value) { calls.filters.push({ table, column, value }); return query; },
        not(column, operator, value) { calls.filters.push({ table, column, operator, value }); return query; },
        gte() { return query; },
        order() { return query; }, limit() { return query; },
        maybeSingle: async () => responseFor(table),
        then(resolve, reject) {
          const result = responseFor(table);
          return Promise.resolve(table === "ai_check_ins" ? { data: options.priorEntries ?? [], error: null } : result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const admin = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return { data: { entry_id: randomUUID(), analysis: args.p_analysis ?? analysis(), local_day: "2026-10-02", timezone: "America/New_York", session_indicators: [], daily_scores: [], scoring_mode: "immediate" }, error: options.saveError ?? null };
    },
  };
  const modules = {
    "next/server": { NextResponse: { json: (value, options) => Response.json(value, options) } },
    "@/lib/constants": constants,
    "@/lib/check-in/analysis": analysisModule,
    "@/lib/check-in/perplexity": {
      ...providerModule,
      analyzeWithPerplexity: async (...args) => {
        calls.provider.push(args);
        return options.invalidAnalysis ? { bad: true } : analysis();
      },
    },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/supabase/credentials": credentials,
    "@/lib/user-name": userName,
  };
  const exports = {};
  vm.runInNewContext(routeCode, {
    exports, require: (name) => {
      if (!modules[name]) throw new Error(`Unexpected route dependency: ${name}`);
      return modules[name];
    },
    process: { env }, Request, Response, URL, Date, Intl, Set, Error, console: { error: (...args) => calls.logs.push(args) },
  });
  return { route: exports, calls };
}

function request(body) {
  return new Request("http://localhost/api/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("route authenticates, validates, calls Perplexity and persists only validated evidence", async () => {
  const body = input();
  const { route, calls } = loadRoute();
  const result = await route.POST(request(body));
  assert.equal(result.status, 200);
  assert.equal(calls.provider.length, 1);
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0].name, "save_check_in_evidence");
  assert.equal(calls.rpc[0].args.p_user_id, user);
  assert.equal(calls.rpc[0].args.p_content, content);
  assert.deepEqual(calls.rpc[0].args.p_analysis, analysis());
  assert.equal(calls.provider[0][1].prior_entries.length, 0);
  assert.equal(calls.provider[0][1].user_full_name, "Ada Lovelace");
});

test("route rejects unauthorized, unconfigured, unsupported and nonconsenting submissions before provider calls", async () => {
  for (const [options, changes, status] of [
    [{ unauthenticated: true }, {}, 401],
    [{ env: { PERPLEXITY_CHECK_INS_ENABLED: "false" } }, {}, 503],
    [{ env: { SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_synthetic-test" } }, {}, 503],
    [{}, { locale: "es-US" }, 400],
    [{}, { consent_version: undefined }, 400],
  ]) {
    const { route, calls } = loadRoute(options);
    const result = await route.POST(request({ ...input(), ...changes }));
    assert.equal(result.status, status);
    assert.equal(calls.provider.length, 0);
    assert.equal(calls.rpc.length, 0);
  }
});

test("follow-up replies keep the session and provide the prior question as context", async () => {
  const previous = { ...analysis(), follow_up_question: "How did the walk feel?" };
  const body = { ...input(), content: "Today I felt refreshed after walking." };
  const { route, calls } = loadRoute({ priorEntries: [{ analysis: previous }] });
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal(calls.provider[0][0], body.content);
  assert.equal(calls.provider[0][1].prior_entries.length, 1);
  assert.equal(calls.provider[0][1].prior_entries[0].acknowledgement, previous.acknowledgement);
  assert.equal(calls.provider[0][1].prior_entries[0].follow_up_question, previous.follow_up_question);
  assert.equal(calls.rpc[0].args.p_session_id, body.session_id);
  assert.equal(calls.rpc[0].args.p_request_id, body.request_id);
  assert.equal(calls.rpc[0].args.p_content, body.content);
});

test("retrying a saved entry avoids another provider call; changed content returns conflict", async () => {
  const body = input();
  const existing = { id: randomUUID(), content, session_id: body.session_id };
  const { route, calls } = loadRoute({ existing });
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal(calls.provider.length, 0);
  assert.equal(calls.rpc[0].name, "get_check_in_result");
  assert.equal((await route.POST(request({ ...body, content: "Different entry." }))).status, 409);
  assert.equal(calls.provider.length, 0);
});

test("invalid analysis cannot be persisted and errors never log entry text or secrets", async () => {
  const { route, calls } = loadRoute({ invalidAnalysis: true });
  assert.equal((await route.POST(request(input()))).status, 502);
  assert.equal(calls.rpc.length, 0);
  assert.equal(JSON.stringify(calls.logs).includes(content), false);
  assert.equal(JSON.stringify(calls.logs).includes("synthetic-key"), false);
  const malformed = new Request("http://localhost/api/check-in", { method: "POST", body: "not JSON" });
  assert.equal((await route.POST(malformed)).status, 400);
});

test("a save failure does not return a success-shaped analysis", async () => {
  const { route } = loadRoute({ saveError: { code: "XX000" } });
  const result = await route.POST(request(input()));
  assert.equal(result.status, 503);
  assert.equal(typeof (await result.json()).error, "string");
});

test("history restores the latest user-owned session when browser session storage is empty", async () => {
  const existing = { id: randomUUID(), session_id: randomUUID() };
  const { route, calls } = loadRoute({ existing });
  const response = await route.GET(new Request("http://localhost/api/check-in"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session_id, existing.session_id);
  assert.ok(calls.filters.some((filter) => filter.column === "user_id" && filter.value === user));
  assert.ok(calls.filters.some((filter) => filter.column === "session_id" && filter.operator === "is" && filter.value === null));
  assert.equal(calls.rpc[0].name, "get_check_in_result");
  assert.equal(calls.rpc[0].args.p_user_id, user);
  assert.equal(calls.rpc[0].args.p_entry_id, existing.id);
});

test("history returns every turn of the restored session, oldest first", async () => {
  const existing = { id: randomUUID(), session_id: randomUUID() };
  const priorEntries = [
    { id: randomUUID(), content: "First entry", analysis: analysis(), created_at: "2026-10-02T12:00:00Z" },
    { id: existing.id, content: "A reply", analysis: analysis(), created_at: "2026-10-02T12:05:00Z" },
  ];
  const { route, calls } = loadRoute({ existing, priorEntries });
  const body = await (await route.GET(new Request("http://localhost/api/check-in"))).json();
  assert.deepEqual(body.turns.map((entry) => entry.content), ["First entry", "A reply"]);
  assert.ok(calls.filters.some((filter) => filter.table === "ai_check_ins" && filter.column === "session_id" && filter.value === existing.session_id));
});

test("history validates explicit sessions and reports empty, unauthorized, or failed lookups", async () => {
  for (const [options, suffix, status] of [
    [{}, "", 200],
    [{}, "?session_id=invalid", 400],
    [{ unauthenticated: true }, "", 401],
    [{ historyError: { code: "XX000" } }, "", 503],
  ]) {
    const { route } = loadRoute(options);
    const response = await route.GET(new Request(`http://localhost/api/check-in${suffix}`));
    assert.equal(response.status, status);
    if (status === 200) assert.equal((await response.json()).entry_id, null);
    else assert.equal(typeof (await response.json()).error, "string");
  }
  const sessionId = randomUUID();
  const { route, calls } = loadRoute();
  await route.GET(new Request(`http://localhost/api/check-in?session_id=${sessionId}`));
  assert.ok(calls.filters.some((filter) => filter.column === "session_id" && filter.value === sessionId));
});

test("server credentials reject publishable/anon keys and accept secret/service-role formats", () => {
  const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.synthetic`;
  assert.equal(credentials.isPrivilegedSupabaseKey("sb_publishable_synthetic"), false);
  assert.equal(credentials.isPrivilegedSupabaseKey(jwt("anon")), false);
  assert.equal(credentials.isPrivilegedSupabaseKey(jwt("authenticated")), false);
  assert.equal(credentials.isPrivilegedSupabaseKey("invalid"), false);
  assert.equal(credentials.isPrivilegedSupabaseKey(undefined), false);
  assert.equal(credentials.isPrivilegedSupabaseKey("sb_secret_synthetic"), true);
  assert.equal(credentials.isPrivilegedSupabaseKey(jwt("service_role")), true);
});
