import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, modules, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: (name) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    }, Error, ...globals,
  });
  return exports;
}

const verified = { id: "synthetic-user", email_confirmed_at: "2026-10-04T00:00:00Z" };
const session = { access_token: "synthetic-session" };
const success = () => ({ data: { user: verified, session }, error: null });
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("")
  : tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" ? tree : "";
const find = (tree, predicate) => nodes(tree).find(predicate);

function harness(mode = "signup", options = {}) {
  const states = [];
  const calls = { signUp: [], login: [], verify: [], resend: [], signOut: [], navigation: [] };
  let stateIndex = 0;
  let effect;
  let timeout;
  const auth = {
    signUp: async (args) => {
      calls.signUp.push(args);
      return options.signupResult ?? { data: { user: { id: "synthetic-user" }, session: null }, error: null };
    },
    signInWithPassword: async (args) => {
      calls.login.push(args);
      return options.loginResult ?? success();
    },
    verifyOtp: async (args) => {
      calls.verify.push(args);
      return options.verifyResult ?? success();
    },
    resend: async (args) => {
      calls.resend.push(args);
      return options.resendResult ?? { error: null };
    },
    signOut: async (args) => { calls.signOut.push(args); return { error: null }; },
  };
  const { AuthForm } = load("../components/auth/auth-form.tsx", {
    "react/jsx-runtime": jsxRuntime,
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        }];
      },
      useEffect(callback) { effect = callback; },
    },
    "@/components/route-loader": { RouteLoader: "RouteLoader" },
    "@/components/ui": { Button: "Button" },
    "@/lib/supabase/client": { createClient: () => ({ auth }) },
    "@/lib/user-name": { cleanName: (value) => value.trim(), MAX_NAME_LENGTH: 80 },
  }, {
    window: {
      location: { origin: "https://example.test", replace: (url) => calls.navigation.push(url) },
      setTimeout: (callback) => { timeout = callback; return 1; },
      clearTimeout: () => { timeout = null; },
    },
  });
  const render = () => { stateIndex = 0; return AuthForm({ mode }); };
  const change = (autoComplete, value) => {
    const input = find(render(), (node) => node.type === "input" && node.props.autoComplete === autoComplete);
    assert.ok(input, `Missing input: ${autoComplete}`);
    input.props.onChange({ target: { value } });
  };
  change("email", " person@example.test ");
  change(mode === "signup" ? "new-password" : "current-password", "synthetic-password");
  if (mode === "signup") {
    change("given-name", " First ");
    change("family-name", " Last ");
  }
  return {
    render, change, calls,
    submit: () => find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
    resend: () => find(render(), (node) => node.type === "Button" && text(node).startsWith("Resend code")).props.onClick(),
    tick(seconds) {
      for (let second = 0; second < seconds; second++) {
        render();
        effect();
        const callback = timeout;
        timeout = null;
        callback?.();
      }
    },
  };
}

test("signup waits for an OTP, clears the password, and resends only after the cooldown", async () => {
  const h = harness();
  await h.submit();
  assert.equal(h.calls.signUp[0].email, "person@example.test");
  assert.equal(h.calls.signUp[0].options.data.first_name, "First");
  assert.equal(h.calls.navigation.length, 0);
  assert.ok(text(h.render()).includes("Verify your email: person@example.test"));
  assert.equal(find(h.render(), (node) => node.type === "input" && node.props.type === "password"), undefined);
  const input = find(h.render(), (node) => node.type === "input");
  assert.equal(input.props.autoComplete, "one-time-code");
  assert.equal(input.props.inputMode, "numeric");
  await h.resend();
  assert.equal(h.calls.resend.length, 0);
  h.tick(59);
  await h.resend();
  assert.equal(h.calls.resend.length, 0);
  h.tick(1);
  await h.resend();
  assert.equal(h.calls.resend.length, 1);
  assert.equal(h.calls.resend[0].type, "signup");
  assert.equal(h.calls.resend[0].email, "person@example.test");
  assert.ok(text(h.render()).includes("Resend code in 60s"));
});

test("valid OTP verification establishes a confirmed session before navigating", async () => {
  const h = harness();
  await h.submit();
  h.change("one-time-code", "123456");
  await h.submit();
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.verify[0].email, "person@example.test");
  assert.equal(h.calls.verify[0].token, "123456");
  assert.equal(h.calls.verify[0].type, "email");
  assert.deepEqual(h.calls.navigation, ["/dashboard"]);
});

test("malformed codes are rejected locally without an Auth request", async () => {
  for (const token of ["", "12345", "abcdef", "1234567"]) {
    const h = harness();
    await h.submit();
    h.change("one-time-code", token);
    await h.submit();
    assert.equal(h.calls.verify.length, 0);
    assert.ok(text(h.render()).includes("Enter the six-digit code"));
  }
});

test("incorrect, expired, reused, and superseded codes rejected by Supabase never enter the app", async () => {
  for (const reason of ["incorrect", "expired", "reused", "superseded"]) {
    const h = harness("signup", { verifyResult: { data: { user: null, session: null }, error: { message: reason, status: 403 } } });
    await h.submit();
    h.change("one-time-code", "123456");
    await h.submit();
    assert.equal(h.calls.navigation.length, 0);
    assert.ok(text(h.render()).includes("invalid or expired"));
    assert.equal(find(h.render(), (node) => node.type === "input").props.value, "123456");
    assert.equal(find(h.render(), (node) => node.type === "Button").props.loading, false);
  }
});

test("verification rate limits show a retry message without granting access", async () => {
  const h = harness("signup", { verifyResult: { data: {}, error: { status: 429 } } });
  await h.submit();
  h.change("one-time-code", "123456");
  await h.submit();
  assert.ok(text(h.render()).includes("Too many attempts"));
  assert.equal(h.calls.navigation.length, 0);
});

test("verification without both a session and a confirmed email fails closed", async () => {
  for (const data of [{ user: verified, session: null }, { user: { id: "synthetic-user" }, session }]) {
    const h = harness("signup", { verifyResult: { data, error: null } });
    await h.submit();
    h.change("one-time-code", "123456");
    await h.submit();
    assert.equal(h.calls.navigation.length, 0);
    assert.equal(h.calls.signOut.length, 1);
    assert.ok(text(h.render()).includes("Unable to confirm"));
  }
});

test("signup with confirmation disabled rejects and signs out an immediate session", async () => {
  const h = harness("signup", { signupResult: success() });
  await h.submit();
  assert.equal(h.calls.signOut[0].scope, "local");
  assert.equal(h.calls.navigation.length, 0);
  assert.ok(text(h.render()).includes("Email verification is unavailable"));
});

test("unconfirmed password login recovers the verification screen after reload", async () => {
  const h = harness("login", { loginResult: { data: {}, error: { code: "email_not_confirmed" } } });
  await h.submit();
  assert.equal(find(h.render(), (node) => node.type === "Button").props.loading, false);
  assert.ok(text(h.render()).includes("Verify your email"));
  await h.resend();
  assert.equal(h.calls.resend.length, 1);
  h.change("one-time-code", "123456");
  await h.submit();
  assert.deepEqual(h.calls.navigation, ["/dashboard"]);
});

test("a session with unconfirmed email is signed out instead of entering through login", async () => {
  const h = harness("login", { loginResult: { data: { user: { id: "synthetic-user" }, session }, error: null } });
  await h.submit();
  assert.equal(h.calls.signOut.length, 1);
  assert.equal(h.calls.navigation.length, 0);
  assert.ok(text(h.render()).includes("Verify your email"));
});

test("resend clears an old code on success and enforces cooldown even on failure", async () => {
  for (const failed of [false, true]) {
    const h = harness("signup", { resendResult: { error: failed ? new Error("Email rate limit reached") : null } });
    await h.submit();
    h.change("one-time-code", "123456");
    h.tick(60);
    await h.resend();
    assert.equal(find(h.render(), (node) => node.type === "input").props.value, failed ? "123456" : "");
    assert.ok(text(h.render()).includes(failed ? "Email rate limit reached" : "Use the latest code"));
    await h.resend();
    assert.equal(h.calls.resend.length, 1);
    assert.equal(h.calls.navigation.length, 0);
  }
});

test("verified password login and ordinary login failures retain their existing behavior", async () => {
  const h = harness("login");
  await h.submit();
  assert.deepEqual(h.calls.navigation, ["/dashboard"]);
  const failed = harness("login", { loginResult: { data: {}, error: new Error("Invalid login credentials") } });
  await failed.submit();
  assert.ok(text(failed.render()).includes("Invalid login credentials"));
  assert.equal(failed.calls.navigation.length, 0);
});

test("protected layout and auth redirects require a confirmed email", async () => {
  for (const user of [null, { id: "synthetic-user" }, verified]) {
    const modules = {
      "react/jsx-runtime": jsxRuntime,
      "next/navigation": { redirect: (url) => { throw new Error(`redirect:${url}`); } },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
      "@/components/app-shell": { AppShell: "AppShell" },
      "@/lib/user-name": { getFullName: () => "Synthetic user" },
      "next/link": { default: "Link" },
      "@/components/auth/auth-form": { AuthForm: "AuthForm" },
      "@/components/brand-mark": { BrandMark: "BrandMark" },
    };
    const layout = load("../app/(app)/layout.tsx", modules).default;
    if (user?.email_confirmed_at) await layout({ children: "protected" });
    else await assert.rejects(layout({ children: "protected" }), /redirect:\/login/);
    for (const file of ["../app/(auth)/login/page.tsx", "../app/(auth)/sign-up/page.tsx"]) {
      const page = load(file, modules).default;
      if (user?.email_confirmed_at) await assert.rejects(page({ searchParams: Promise.resolve({}) }), /redirect:\/dashboard/);
      else await page({ searchParams: Promise.resolve({}) });
    }
  }
});

test("unverified users cannot load app data or invoke write actions directly", async () => {
  const modules = {
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "synthetic-user" } }, error: null }) },
      from: () => assert.fail("Unverified user reached the database"),
      rpc: () => assert.fail("Unverified user reached an RPC"),
    }) },
    "next/cache": { revalidatePath: () => assert.fail("Unverified user invalidated a path") },
    "@/lib/constants": {}, "@/lib/level": {}, "@/lib/scoring": {},
    "@/lib/todos": { isTodoCategory: () => true },
    "@/lib/utils": { isStatName: () => true, isSubstatId: () => true },
    "@/lib/user-name": { cleanName: (value) => value, MAX_NAME_LENGTH: 80 },
  };
  const data = load("../lib/data.ts", modules);
  await assert.rejects(data.getJournalEntries(), /verified email/);
  const journal = load("../app/actions/journal.ts", modules);
  const journalForm = new FormData();
  journalForm.set("content", "Synthetic entry");
  assert.match((await journal.createJournalEntry({}, journalForm)).error, /verified email/);
  const settings = load("../app/actions/settings.ts", modules);
  assert.match((await settings.updateProfileName("First", "Last")).error, /verified email/);
  assert.match((await settings.updateLifeStatsSettings({})).error, /verified email/);
  const quests = load("../app/actions/quests.ts", modules);
  assert.match((await quests.createQuest({}, new FormData())).error, /verified email/);
  assert.match((await quests.completeQuest("synthetic-quest")).error, /verified email/);
  assert.match((await quests.deleteQuest("synthetic-quest")).error, /verified email/);
  const todos = load("../app/actions/todos.ts", modules);
  const todoForm = new FormData();
  todoForm.set("title", "Synthetic todo");
  todoForm.set("category", "personal");
  assert.match((await todos.createTodo({}, todoForm)).error, /verified email/);
  assert.match((await todos.setTodoCompleted("synthetic-todo", true)).error, /verified email/);
  assert.match((await todos.deleteTodo("synthetic-todo")).error, /verified email/);
});
