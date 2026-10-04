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

function harness({ readAloud = true, fail = false, refreshFail = false, restored = null, savedSession = null, result = savedResult, turns = null } = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  const storage = new Map(savedSession ? [["lifestats-check-in-session:test-user", savedSession]] : []);
  const calls = { requests: [], history: [], spoken: [], refreshed: 0, invalidated: 0, focused: 0, scrolled: 0, latestScrolled: 0, latestFocused: 0 };
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
    crypto: { randomUUID }, Error, DOMException, AbortController, setTimeout: (callback) => { callback(); return 0; },
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
  states[1] = result;
  if (turns) states[15] = turns;
  states[9] = readAloud;
  states[11] = true;
  refs[0].current = session;
  refs[3].current = { focus: () => { calls.focused++; }, scrollIntoView: () => { calls.scrolled++; } };
  refs[4].current = true;
  refs[6].current = { scrollIntoView: () => { calls.latestScrolled++; }, focus: () => { calls.latestFocused++; } };
  return {
    render, calls, session, storage,
    hydrate: async () => { effects[0](); await new Promise((resolve) => setImmediate(resolve)); },
    runScrollEffect: () => { effects[2](); },
    detectDictation: async () => { effects[1](); await new Promise((resolve) => setImmediate(resolve)); },
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
  assert.ok(text(tree).includes("Your reply"));
  assert.ok(text(tree).includes("Optional follow-up"));
  const input = find(tree, (node) => node.type === "textarea");
  assert.equal(input.props["aria-describedby"], "check-in-follow-up");
  assert.ok(input.props.placeholder.includes("reply"));
  assert.equal(button(tree, "Send reply").props.disabled, true);
  assert.ok(button(tree, "Skip"));
  button(tree, "Read aloud").props.onClick();
  assert.equal(h.calls.spoken[0], speech.checkInResponseText(savedResult.analysis));
  input.props.onChange({ target: { value: "Today I felt refreshed after walking." } });
  tree = h.render();
  assert.equal(button(tree, "Send reply").props.disabled, false);
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
  assert.ok(text(tree).includes("Thanks for sharing."));
  assert.ok(text(tree).includes("Saved, but refresh failed."));
  assert.ok(text(tree).includes("Journal"));
  assert.ok(text(tree).includes("Stats"));
});

test("starting a new check-in clears the result and opens a fresh session with the same timezone", async () => {
  const restored = { ...savedResult, session_id: randomUUID(), timezone: "America/New_York" };
  const h = harness({ restored, readAloud: false });
  await h.hydrate();
  assert.ok(text(h.render()).includes("Thanks for sharing."));
  button(h.render(), "Start a new check-in").props.onClick();
  const tree = h.render();
  assert.ok(!text(tree).includes("Thanks for sharing."));
  assert.ok(!text(tree).includes("Optional follow-up"));
  const fresh = h.storage.get("lifestats-check-in-session:test-user");
  assert.notEqual(fresh, restored.session_id);
  find(tree, (node) => node.type === "textarea").props.onChange({ target: { value: "Today I read for an hour." } });
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.requests[0].session_id, fresh);
  assert.equal(h.calls.requests[0].timezone, restored.timezone);
  assert.equal(h.calls.focused, 1);
});

test("skipping the follow-up hides the reply box and promotes starting a new check-in", () => {
  const h = harness({ readAloud: false });
  assert.ok(find(h.render(), (node) => node.type === "form"));
  button(h.render(), "Skip").props.onClick();
  const tree = h.render();
  assert.equal(find(tree, (node) => node.type === "form"), undefined);
  assert.equal(button(tree, "Start a new check-in").props.variant, "primary");
  assert.ok(text(tree).includes("Thanks for sharing."));
});

test("results list applied points for today and explain when nothing was scored", () => {
  const scored = { ...savedResult, analysis: { ...savedResult.analysis, follow_up_question: null }, daily_scores: [
    { substat_id: "fitness", applied_change: 2, daily_allowance_used: 2 },
    { substat_id: "sleep", applied_change: 0, daily_allowance_used: 1 },
  ] };
  const withPoints = text(harness({ readAloud: false, result: scored }).render());
  assert.ok(withPoints.includes("Points today"));
  assert.ok(withPoints.includes("fitness+2"));
  assert.ok(!withPoints.includes("sleep"));
  const none = text(harness({ readAloud: false }).render());
  assert.ok(none.includes("No new points from this entry."));
});

test("dictation is offered only where on-device recognition is available", async () => {
  const dictate = (tree) => button(tree, "Dictate");
  const unsupported = harness({ readAloud: false });
  assert.equal(dictate(unsupported.render()), undefined);
  await unsupported.detectDictation();
  const noApi = unsupported.render();
  assert.equal(dictate(noApi), undefined);
  assert.ok(text(noApi).includes("keyboard's microphone key"));

  const original = globalThis.window;
  const makeRecognition = (availability) => {
    class Recognition { static available() { return Promise.resolve(availability); } }
    Recognition.prototype.processLocally = false;
    return Recognition;
  };
  try {
    for (const [availability, offered] of [["available", true], ["downloadable", true], ["unavailable", false]]) {
      globalThis.window = { isSecureContext: true, SpeechRecognition: makeRecognition(availability) };
      const h = harness({ readAloud: false });
      await h.detectDictation();
      assert.equal(Boolean(dictate(h.render())), offered, availability);
    }
  } finally {
    if (original === undefined) delete globalThis.window; else globalThis.window = original;
  }
});

const turn = (id, content, acknowledgement, extra = {}) => ({ id, content, analysis: { ...savedResult.analysis, acknowledgement, ...extra } });

test("the whole conversation stays visible: each reply is appended after the original entry", async () => {
  const first = turn("t1", "I played pickleball today.", "Nice, an active day.", { follow_up_question: "Was this new for you?" });
  const h = harness({ readAloud: false, turns: [first], result: { ...savedResult, analysis: first.analysis } });
  let tree = h.render();
  assert.ok(text(tree).includes("I played pickleball today."));
  assert.ok(text(tree).includes("Nice, an active day."));
  find(tree, (node) => node.type === "textarea").props.onChange({ target: { value: "It was my first time." } });
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = h.render();
  const shown = text(tree);
  assert.ok(shown.includes("I played pickleball today."), "original entry is kept");
  assert.ok(shown.includes("It was my first time."), "the reply is shown");
  assert.ok(shown.indexOf("I played pickleball today.") < shown.indexOf("It was my first time."), "oldest first");
  assert.ok(shown.includes("Thanks for sharing."), "the new response is shown");
  assert.equal(nodes(tree).filter((node) => node.type === "section").length, 2);
});

test("a saved reply moves focus to the new response instead of the reply box", async () => {
  const h = harness({ readAloud: false, turns: [turn("t1", "I ran today.", "Great run.", { follow_up_question: "How far?" })] });
  find(h.render(), (node) => node.type === "textarea").props.onChange({ target: { value: "Five kilometers." } });
  await find(h.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.latestScrolled, 0, "nothing scrolls until the new response is rendered");
  h.runScrollEffect();
  assert.equal(h.calls.latestScrolled, 1);
  assert.equal(h.calls.latestFocused, 1);
  h.runScrollEffect();
  assert.equal(h.calls.latestScrolled, 1, "only scrolls once per saved reply");
});

test("only the newest response is expanded; earlier turns stay compact", () => {
  const turns = [
    turn("t1", "First entry.", "First ack.", { follow_up_question: "Tell me more?", practical_tip: "First tip." }),
    turn("t2", "More detail.", "Second ack.", { follow_up_question: null }),
  ];
  const h = harness({ readAloud: false, result: { ...savedResult, analysis: { ...savedResult.analysis, acknowledgement: "Second ack.", follow_up_question: null } }, turns });
  const tree = h.render();
  const shown = text(tree);
  assert.ok(shown.includes("First ack.") && shown.includes("Second ack."));
  assert.ok(shown.includes("Follow-up asked: Tell me more?"));
  assert.equal(nodes(tree).filter((node) => node.type === "details").length, 1, "scoring details appear once, on the latest response");
});
