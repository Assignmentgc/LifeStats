import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const speech = (await import(pathToFileURL(path.join(process.env.CHECK_IN_BUILD_DIR, "lib/check-in/speech.js")))).default;
const code = ts.transpileModule(readFileSync(new URL("../components/check-in/check-in-form.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const savedResult = {
  entry_id: randomUUID(), local_day: "2026-10-02", daily_scores: [],
  analysis: {
    acknowledgement: "Thanks for sharing.", practical_tip: "Keep a comfortable pace.",
    follow_up_question: "How did the walk feel?", evidence: [], safety_flags: [],
  },
};

function harness({ readAloud = true, fail = false, refreshFail = false, restored = null, savedSession = null } = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  const storage = new Map(savedSession ? [["lifestats-check-in-session:test-user", savedSession]] : []);
  const calls = { requests: [], history: [], spoken: [], refreshed: 0, invalidated: 0, focused: 0, scrolled: 0 };
  const session = { id: randomUUID(), timezone: "America/New_York" };
  let stateIndex = 0;
  let refIndex = 0;
  let failing = fail;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useEffect(effect) { effects.push(effect); },
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = value; }];
      },
      useRef(initial) {
        const index = refIndex++;
        refs[index] ??= { current: initial };
        return refs[index];
      },
    },
    "lucide-react": { Mic: "Mic", Send: "Send", Sparkles: "Sparkles", Square: "Square", Volume2: "Volume2" },
    "next/navigation": { useRouter: () => ({ refresh: () => { calls.refreshed++; } }) },
    "next/link": { default: "Link" },
    "@/app/actions/check-in": { refreshCheckInViews: async () => {
      calls.invalidated++;
      return refreshFail ? { error: "Saved, but refresh failed." } : { success: true };
    } },
    "@/components/ui": { Button: "Button", Panel: "Panel", StatTag: "StatTag" },
    "@/lib/constants": { SUBSTAT_META: {} },
    "@/lib/check-in/analysis": { CHECK_IN_LOCALE: "en-US", isUuid: (value) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value) },
    "@/lib/check-in/speech": speech,
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: (name) => {
      assert.ok(modules[name], `Unexpected form dependency: ${name}`);
      return modules[name];
    },
    crypto: { randomUUID }, Error, DOMException, AbortController,
    sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { speechSynthesis: {
      getVoices: () => [{ lang: "en-US", localService: true }],
      cancel() {}, speak: (utterance) => calls.spoken.push(utterance.text),
    } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    fetch: async (_url, options) => {
      if (!options.body) {
        calls.history.push(_url);
        return { ok: true, json: async () => restored ?? { entry_id: null } };
      }
      calls.requests.push(JSON.parse(options.body));
      return { ok: !failing, json: async () => failing ? { error: "Please retry." } : savedResult };
    },
  });
  function render() {
    stateIndex = 0;
    refIndex = 0;
    return exports.CheckInForm({ userId: "test-user" });
  }
  render();
  states[1] = savedResult;
  states[9] = readAloud;
  states[10] = true;
  states[11] = true;
  refs[0].current = session;
  refs[3].current = { focus: () => { calls.focused++; }, scrollIntoView: () => { calls.scrolled++; } };
  refs[4].current = true;
  return {
    render, calls, session, storage,
    hydrate: async () => { effects[0](); await new Promise((resolve) => setImmediate(resolve)); },
    recover: () => { failing = false; },
  };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree && typeof tree === "object") return text(tree.props?.children);
  return typeof tree === "string" ? tree : "";
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const button = (tree, label) => find(tree, (node) => node.type === "Button" && text(node).trim() === label);

test("follow-up form labels the reply, focuses it, and speaks the full response manually and automatically", async () => {
  const h = harness();
  let tree = h.render();
  assert.ok(text(tree).includes("Your follow-up response (US English)"));
  const input = find(tree, (node) => node.type === "textarea");
  assert.equal(input.props["aria-describedby"], "check-in-follow-up");
  assert.ok(input.props.placeholder.includes("answer"));
  assert.equal(button(tree, "Send follow-up response").props.disabled, true);
  button(tree, "Answer follow-up").props.onClick();
  assert.equal(h.calls.focused, 1);
  assert.equal(h.calls.scrolled, 1);
  button(tree, "Read response").props.onClick();
  assert.equal(h.calls.spoken[0], speech.checkInResponseText(savedResult.analysis));
  input.props.onChange({ target: { value: "Today I felt refreshed after walking." } });
  tree = h.render();
  assert.equal(button(tree, "Send follow-up response").props.disabled, false);
  await find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.requests[0].session_id, h.session.id);
  assert.equal(h.calls.requests[0].content, "Today I felt refreshed after walking.");
  assert.equal(h.calls.spoken[1], speech.checkInResponseText(savedResult.analysis));
  assert.equal(h.calls.refreshed, 1);
  assert.equal(h.calls.invalidated, 1);
  assert.equal(find(h.render(), (node) => node.type === "textarea").props.value, "");
});

test("failed follow-up saves preserve the draft and reuse the request ID; unchecked autoplay stays silent", async () => {
  const h = harness({ readAloud: false, fail: true });
  find(h.render(), (node) => node.type === "textarea").props.onChange({ target: { value: "Today I felt refreshed." } });
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(find(h.render(), (node) => node.type === "textarea").props.value, "Today I felt refreshed.");
  assert.ok(text(h.render()).includes("Please retry."));
  assert.equal(h.calls.invalidated, 0);
  h.recover();
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.requests[0].request_id, h.calls.requests[1].request_id);
  assert.equal(h.calls.spoken.length, 0);
});

test("a new browser session restores the database session and uses its ID and timezone for replies", async () => {
  const restored = { ...savedResult, session_id: randomUUID(), timezone: "America/New_York" };
  const h = harness({ restored });
  await h.hydrate();
  assert.equal(h.calls.history[0], "/api/check-in");
  assert.equal(h.storage.get("lifestats-check-in-session:test-user"), restored.session_id);
  find(h.render(), (node) => node.type === "textarea").props.onChange({ target: { value: "Today I felt refreshed." } });
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.requests[0].session_id, restored.session_id);
  assert.equal(h.calls.requests[0].timezone, restored.timezone);
});

test("an existing browser session is requested explicitly and an empty session is retained", async () => {
  const savedSession = randomUUID();
  const h = harness({ savedSession });
  await h.hydrate();
  assert.equal(h.calls.history[0], `/api/check-in?session_id=${savedSession}`);
  assert.equal(h.storage.get("lifestats-check-in-session:test-user"), savedSession);
});

test("refresh errors distinguish a committed check-in from a failed save", async () => {
  const h = harness({ refreshFail: true, readAloud: false });
  find(h.render(), (node) => node.type === "textarea").props.onChange({ target: { value: "Today I took a walk." } });
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  const tree = h.render();
  assert.equal(find(tree, (node) => node.type === "textarea").props.value, "");
  assert.ok(text(tree).includes("Evidence saved"));
  assert.ok(text(tree).includes("Saved, but refresh failed."));
  assert.ok(text(tree).includes("View saved entries"));
  assert.ok(text(tree).includes("View updated substats"));
});

test("starting a new check-in clears the result and opens a fresh session with the same timezone", async () => {
  const restored = { ...savedResult, session_id: randomUUID(), timezone: "America/New_York" };
  const h = harness({ restored, readAloud: false });
  await h.hydrate();
  assert.ok(text(h.render()).includes("Evidence saved"));
  button(h.render(), "Start a new check-in").props.onClick();
  const tree = h.render();
  assert.ok(!text(tree).includes("Evidence saved"));
  assert.ok(!text(tree).includes("Follow-up question"));
  const fresh = h.storage.get("lifestats-check-in-session:test-user");
  assert.notEqual(fresh, restored.session_id);
  find(tree, (node) => node.type === "textarea").props.onChange({ target: { value: "Today I read for an hour." } });
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.requests[0].session_id, fresh);
  assert.equal(h.calls.requests[0].timezone, restored.timezone);
});
