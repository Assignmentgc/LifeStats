import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(relativePath, modules) {
  const code = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  return exports;
}

test("saved check-ins and manual entries share a newest-first journal without duplicate writes", async () => {
  const queries = [];
  const journal = { id: "manual", user_id: "user", content: "A manual reflection", mood: "good", created_at: "2026-10-02T12:00:00Z" };
  const checkIn = { id: "check-in", user_id: "user", content: "Today I walked.", created_at: "2026-10-03T12:00:00Z" };
  let failing = false;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user", email_confirmed_at: "2026-10-04T00:00:00Z" } } }) },
    from: (table) => {
      queries.push(table);
      return { select: () => ({ order: async () => ({
        data: [table === "journal_entries" ? journal : checkIn],
        error: failing && table === "ai_check_ins" ? { message: "History unavailable" } : null,
      }) }) };
    },
  };
  const data = load("../lib/data.ts", {
    "@/lib/constants": {}, "@/lib/level": {}, "@/lib/scoring": {},
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  const entries = await data.getJournalEntries();
  assert.deepEqual(Array.from(entries, (entry) => entry.id), ["check-in", "manual"]);
  assert.equal(entries[0].content, checkIn.content);
  assert.equal(entries[0].source, "check-in");
  assert.equal(entries[0].mood, null);
  assert.equal(entries[1].mood, "good");
  assert.deepEqual(queries, ["journal_entries", "ai_check_ins"]);
  failing = true;
  await assert.rejects(data.getJournalEntries(), /History unavailable/);
});

test("the post-save Server Action invalidates all persisted check-in views only for authenticated users", async () => {
  const paths = [];
  let user = { id: "user", email_confirmed_at: "2026-10-04T00:00:00Z" };
  const actions = load("../app/actions/check-in.ts", {
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
    }) },
  });
  assert.equal((await actions.refreshCheckInViews()).success, true);
  assert.deepEqual(paths, ["/dashboard", "/stats", "/stats/[category]", "/journal"]);
  paths.length = 0;
  for (const unverified of [{ id: "user", email_confirmed_at: null }, null]) {
    user = unverified;
    assert.match((await actions.refreshCheckInViews()).error, /saved.*verified email/);
    assert.equal(paths.length, 0);
  }
});

const constants = load("../lib/constants.ts", {});
const scoring = load("../lib/scoring.ts", { "@/lib/constants": constants });

test("category points sum actual lifetime gains without a cap or changing LifeScore rules", () => {
  const scores = constants.SUBSTAT_IDS.map((id) => ({ substat_id: id, value: id === "fitness" || id === "friends" ? 2 : 0 }));
  const settings = constants.DEFAULT_LIFESTATS_SETTINGS;
  assert.equal(scoring.calculateBaseStatScore("vitality", scores, settings), 0);
  scores.find((score) => score.substat_id === "spirituality").value = 7;
  assert.equal(scoring.calculateBaseStatScore("environment", scores, settings), 1);
  assert.equal(scoring.calculateBaseStatScore("environment", scores, { ...settings, spiritualityEnabled: false }), 0);
  const totals = scoring.cumulativeCheckInPoints([
    { substat_id: "fitness", applied_change: 2 }, { substat_id: "sleep", applied_change: 3 },
    ...Array.from({ length: 25 }, () => ({ substat_id: "fitness", applied_change: 5 })),
  ]);
  assert.equal(totals.categories.vitality, 130);
  assert.equal(totals.substats.fitness, 127);
  assert.equal(totals.substats.sleep, 3);
  const zeroGains = Object.fromEntries(constants.STAT_NAMES.map((stat) => [stat, 0]));
  assert.equal(scoring.parseCheckInCategoryGains(zeroGains).vitality, 0);
  assert.equal(scoring.parseCheckInCategoryGains(null), null);
  for (const invalid of [{}, [], undefined, { ...zeroGains, vitality: "2" }, { ...zeroGains, vitality: -1 }]) {
    assert.throws(() => scoring.parseCheckInCategoryGains(invalid), /Invalid saved check-in gains/);
  }
});

test("category trend accumulates one stat's applied points per local day over a rolling window", () => {
  const scores = [
    { local_day: "2026-08-01", substat_id: "fitness", applied_change: 4 },
    { local_day: "2026-10-01", substat_id: "fitness", applied_change: 2 },
    { local_day: "2026-10-01", substat_id: "sleep", applied_change: 1.5 },
    { local_day: "2026-10-03", substat_id: "fitness", applied_change: 3 },
    { local_day: "2026-10-03", substat_id: "friends", applied_change: 5 },
    { local_day: "2026-10-04", substat_id: "fitness", applied_change: 9 },
  ];
  const trend = scoring.buildCheckInTrend(scores, "vitality", "2026-10-03", 5);
  assert.deepEqual(Array.from(trend.points, (point) => point.day), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.deepEqual(Array.from(trend.points, (point) => point.value), [4, 4, 7.5, 7.5, 10.5]);
  assert.equal(trend.gained, 6.5);
  assert.equal(trend.total, 10.5);
  assert.equal(scoring.buildCheckInTrend([], "social", "2026-10-03", 30).gained, 0);
  assert.throws(() => scoring.buildCheckInTrend([{ local_day: "2026-10-03", substat_id: "fitness", applied_change: -1 }], "vitality", "2026-10-03"), /Invalid saved/);
});

test("both Character Stat surfaces use cumulative points and only the latest entry's impact", async () => {
  const substats = constants.SUBSTAT_IDS.map((substat_id) => ({ substat_id, value: substat_id === "fitness" ? 2 : 0 }));
  let latest = { category_gains: Object.fromEntries(constants.STAT_NAMES.map((stat) => [stat, stat === "vitality" ? 2 : 0])) };
  let error = null;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user", email_confirmed_at: "2026-10-04T00:00:00Z" } } }) },
    rpc: async () => ({ data: [{ total_xp: 100 }], error: null }),
    from: (table) => {
      const result = () => ({
        data: table === "stat_subscores" ? substats
          : table === "stats" ? constants.STAT_NAMES.map((stat_name) => ({ stat_name, value: 0 }))
          : table === "lifestats_settings" ? { spirituality_enabled: true, include_spirituality_in_life_score: false }
          : table === "check_in_daily_scores" ? [{ substat_id: "fitness", applied_change: 2 }, { substat_id: "sleep", applied_change: 3 }]
          : table === "ai_check_ins" ? latest : [],
        error: table === "ai_check_ins" ? error : null,
      });
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; },
        eq() { return query; }, gte() { return query; }, range() { return query; },
        maybeSingle: async () => result(),
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
  const data = load("../lib/data.ts", {
    "@/lib/constants": constants, "@/lib/level": load("../lib/level.ts", {}), "@/lib/scoring": scoring,
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  for (const fetchData of [data.getDashboardData, data.getStatsData]) {
    const result = await fetchData();
    assert.equal(result.checkInPoints.categories.vitality, 5);
    assert.equal(result.latestCheckInGains.vitality, 2);
    assert.equal(result.lifeScore, 0);
  }
  assert.equal((await data.getDashboardData()).progress.level, 1);
  latest = { category_gains: Object.fromEntries(constants.STAT_NAMES.map((stat) => [stat, 0])) };
  assert.equal((await data.getDashboardData()).latestCheckInGains.vitality, 0);
  assert.equal((await data.getDashboardData()).checkInPoints.categories.vitality, 5);
  latest = { category_gains: null };
  assert.equal((await data.getDashboardData()).latestCheckInGains, null);
  latest = null;
  assert.equal((await data.getDashboardData()).latestCheckInGains, undefined);
  error = { message: "Missing migration" };
  await assert.rejects(data.getDashboardData(), /Could not load latest check-in gains/);
});

test("Character Stat cards show uncapped totals and navigate to individual scores", () => {
  const jsx = (type, props) => ({ type, props });
  const { StatCard } = load("../components/ui/stat-card.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "./types": { STAT_LABELS: { vitality: "Vitality" } },
    "./utils": { cn: (...items) => items.filter(Boolean).join(" ") },
    "next/link": { default: "Link" },
    "@/lib/utils": { formatNumber: (value) => String(value) },
  });
  const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
    : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
  const text = (tree) => Array.isArray(tree) ? tree.map(text).join("")
    : tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" ? tree : "";
  const card = StatCard({ tone: "vitality", value: 130.5, latestGain: 2.5 });
  assert.ok(text(card).includes("130.5points"));
  assert.ok(text(card).includes("+2.5 latest check-in"));
  assert.equal(card.props.href, "/stats/vitality");
  assert.ok(!text(card).includes("/100"));
  const gauge = nodes(card).find((node) => node.props?.className === "stat-card__gauge");
  assert.equal(gauge.props.style, undefined);
  assert.ok(text(StatCard({ tone: "vitality", value: 2, latestGain: 0 })).includes("+0 latest check-in"));
  assert.ok(text(StatCard({ tone: "vitality", value: 2, latestGain: null })).includes("Latest gain unavailable"));
  assert.ok(!text(StatCard({ tone: "vitality", value: 2 })).includes("latest check-in"));
});

test("overall level changes from 0 to 1 at exactly 100 XP", () => {
  const { getPlayerProgress } = load("../lib/level.ts", {});
  for (const [xp, level] of [[0, 0], [99, 0], [99.99, 0], [100, 1], [100.01, 1], [399.99, 1], [400, 2]]) {
    assert.equal(getPlayerProgress(xp).level, level);
  }
  assert.equal(getPlayerProgress(100).xpIntoLevel, 0);
  assert.equal(getPlayerProgress(99).xpToNextLevel, 1);
});
