import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
const compiled = async (name) => (await import(pathToFileURL(path.join(process.env.CHECK_IN_BUILD_DIR, `lib/check-in/${name}.js`)))).default;
const { validateAnalysis, parseCheckInRequest, exclusionReason, dayInTimezone } = await compiled("analysis");
const { analyzeWithPerplexity, extractResponseText, buildCompactContext } = await compiled("perplexity");
const { checkInResponseText, getLocalRecognitionConstructor, prepareLocalRecognition, recognitionErrorMessage, selectLocalEnglishVoice } = await compiled("speech");

const content = "Today I walked for 30 minutes.";
const evidence = {
  substat_id: "fitness", source_quote: "walked for 30 minutes", observation: "Completed a walk",
  activity_key: "walk", direction: "positive", proposed_gain: 1, time_reference: "today", confidence: 0.9, linked_quest_id: null,
};
const analysis = () => ({
  schema_version: "2", language_status: "english", normalized_english: content, evidence: [{ ...evidence }],
  acknowledgement: "You made time for movement.", practical_tip: null, follow_up_question: null, confidence: 0.9, safety_flags: [],
});
const context = { spirituality_enabled: false, prior_entries: [], today_evidence: [], completed_quests: [] };
const envelope = (text) => ({
  status: "completed", error: null, incomplete_details: null,
  output: [{ type: "reasoning" }, { type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
});

test("proposed gains must be +1 to +5 inclusive, decimals supported; negative evidence cannot deduct", () => {
  for (const gain of [1, 1.25, 2.5, 4.99, 5]) {
    const a = analysis();
    a.evidence[0].proposed_gain = gain;
    assert.equal(validateAnalysis(a, content, false, new Set()).evidence[0].proposed_gain, gain);
  }
  for (const gain of [0, -1, 0.99, 5.01, null, "2.5", NaN, Infinity]) {
    const a = analysis();
    a.evidence[0].proposed_gain = gain;
    assert.throws(() => validateAnalysis(a, content, false, new Set()), /invalid analysis/);
  }
  const a = analysis();
  a.evidence[0] = { ...evidence, direction: "negative", proposed_gain: null };
  assert.equal(exclusionReason(validateAnalysis(a, content, false, new Set()), a.evidence[0]), "non_positive");
  a.evidence[0].proposed_gain = -2;
  assert.throws(() => validateAnalysis(a, content, false, new Set()), /invalid analysis/);
});

test("valid US-English evidence preserves original quote and normalized text", () => {
  assert.deepEqual(validateAnalysis(analysis(), content, false, new Set()), analysis());
  assert.equal(exclusionReason(analysis(), evidence), null);
});

test("rejects malformed analysis, invented quotes, invalid substats and disabled spirituality", () => {
  for (const mutate of [
    (a) => { a.unexpected = true; },
    (a) => { a.language_status = ["english"]; },
    (a) => { a.evidence[0].time_reference = ["today"]; },
    (a) => { a.confidence = 1.1; },
    (a) => { a.acknowledgement = ""; },
    (a) => { a.evidence[0].source_quote = "I ran"; },
    (a) => { a.evidence[0].substat_id = "bogus"; },
    (a) => { a.evidence[0].substat_id = "spirituality"; },
    (a) => { a.evidence[0].activity_key = "Walk!"; },
    (a) => { a.evidence = Array.from({ length: 13 }, () => evidence); },
    (a) => { a.follow_up_question = "How? Why?"; },
    (a) => { a.evidence[0].linked_quest_id = "unknown"; },
  ]) {
    const a = analysis(); mutate(a);
    assert.throws(() => validateAnalysis(a, content, false, new Set()), /invalid analysis/);
  }
});

test("unrecognized language is saved only as clarification, never translated evidence", () => {
  const a = { ...analysis(), language_status: "needs_clarification", normalized_english: "", evidence: [], follow_up_question: "Could you describe this in English?" };
  assert.deepEqual(validateAnalysis(a, "Bonjour", false, new Set()), a);
  assert.throws(() => validateAnalysis({ ...a, evidence: [evidence] }, content, false, new Set()), /invalid analysis/);
  assert.throws(() => validateAnalysis({ ...a, normalized_english: "Hello" }, "Bonjour", false, new Set()), /invalid analysis/);
  assert.throws(() => validateAnalysis({ ...a, practical_tip: "An unrelated tip." }, "Bonjour", false, new Set()), /invalid analysis/);
  assert.throws(() => validateAnalysis({ ...analysis(), safety_flags: ["medical_advice"], practical_tip: "A tip." }, content, false, new Set()), /invalid analysis/);
});

test("plans, history, uncertain times, low confidence, linked quests and safety are excluded", () => {
  for (const time of ["planned", "historical", "unclear"]) {
    assert.equal(exclusionReason(analysis(), { ...evidence, time_reference: time }), time);
  }
  assert.equal(exclusionReason(analysis(), { ...evidence, confidence: 0.79 }), "low_confidence");
  assert.equal(exclusionReason({ ...analysis(), confidence: 0.79 }, evidence), "low_confidence");
  assert.equal(exclusionReason(analysis(), { ...evidence, confidence: 0.8 }), null);
  assert.equal(exclusionReason(analysis(), { ...evidence, linked_quest_id: "quest" }), "quest");
  for (const safety of ["self_harm", "immediate_danger", "unsafe_behavior", "medical_advice"]) {
    assert.equal(exclusionReason({ ...analysis(), safety_flags: [safety] }, evidence), "safety");
  }
});

test("request validation enforces locale, identifiers, content and IANA timezone", () => {
  const request = { content, session_id: "62f3e742-f780-4fc5-9302-276f25809273", request_id: "aa1c5166-41fa-4899-a326-c35bf6f42070", locale: "en-US", timezone: "America/New_York", consent_version: "perplexity-text-v1" };
  assert.equal(parseCheckInRequest(request).content, content);
  for (const changes of [{ consent_version: undefined }, { locale: "en-GB" }, { locale: "es-US" }, { timezone: "invalid" }, { content: "a" }, { content: "a".repeat(5001) }, { request_id: "bad" }]) {
    assert.throws(() => parseCheckInRequest({ ...request, ...changes }));
  }
});

test("local dates handle US midnight and daylight-saving transitions", () => {
  assert.equal(dayInTimezone(new Date("2026-10-03T03:59:59Z"), "America/New_York"), "2026-10-02");
  assert.equal(dayInTimezone(new Date("2026-10-03T04:00:00Z"), "America/New_York"), "2026-10-03");
  assert.equal(dayInTimezone(new Date("2026-03-08T06:59:59Z"), "America/New_York"), "2026-03-08");
  assert.equal(dayInTimezone(new Date("2026-11-01T06:00:00Z"), "America/New_York"), "2026-11-01");
});

test("extracts actual HTTP output, rejects incomplete and empty responses", () => {
  assert.equal(extractResponseText(envelope('{"ok":true}')), '{"ok":true}');
  for (const value of [{ output_text: "{}" }, { ...envelope("{}"), status: "incomplete" }, { ...envelope("{}"), error: {} }, { ...envelope("{}"), output: [] }]) {
    assert.throws(() => extractResponseText(value));
  }
});

test("Perplexity request uses no tools, no storage, structured JSON and compact context", async () => {
  let request;
  const output = await analyzeWithPerplexity(content, context, "synthetic-key", "test/model", async (url, options) => {
    assert.equal(url, "https://api.perplexity.ai/v1/agent");
    request = JSON.parse(options.body);
    return Response.json(envelope(JSON.stringify(analysis())));
  });
  assert.deepEqual(output, analysis());
  assert.equal(request.store, false);
  assert.deepEqual(request.tools, []);
  assert.equal(request.response_format.type, "json_schema");
  // Gemini via Perplexity rejects maxItems; the backend/database enforce the cap.
  assert.equal("maxItems" in request.response_format.json_schema.schema.properties.evidence, false);
  assert.equal(request.model, "test/model");
  assert.match(request.instructions, /negated/);
  assert.match(request.instructions, /not personal worth/);
  assert.equal(JSON.parse(request.input).final_entry, content);
  const compact = buildCompactContext({
    ...context, prior_entries: Array.from({ length: 20 }, () => ({ acknowledgement: "x".repeat(1000), follow_up_question: null })),
    today_evidence: Array.from({ length: 100 }, () => ({ substat_id: "fitness", activity_key: "walk", observation: "x".repeat(700), direction: "positive" })),
  });
  assert.equal(compact.prior_entries.length, 3);
  assert.equal(compact.today_evidence.length, 36);
  assert.equal(compact.today_evidence[0].observation.length, 160);
});

test("provider errors and invalid JSON fail explicitly", async () => {
  for (const response of [new Response("", { status: 429 }), Response.json(envelope("not JSON")), Response.json({ status: "incomplete" })]) {
    await assert.rejects(analyzeWithPerplexity(content, context, "synthetic-key", "test/model", async () => response));
  }
  await assert.rejects(analyzeWithPerplexity(content, context, "synthetic-key", "test/model", async () => { throw new DOMException("timeout", "TimeoutError"); }), /timed out/);
  await assert.rejects(analyzeWithPerplexity(content, context, "synthetic-key", "test/model", async () => new Response("", { status: 400 })), /configuration/);
  await assert.rejects(analyzeWithPerplexity(content, context, "synthetic-key", "test/model", async () => new Response("", { status: 429 })), /request limit/);
});

test("spoken check-in response includes the tip and follow-up question in order", () => {
  assert.equal(checkInResponseText({
    acknowledgement: "You made time for movement.",
    practical_tip: "Keep a comfortable pace.",
    follow_up_question: "How did the walk feel?",
  }), "You made time for movement. Keep a comfortable pace. How did the walk feel?");
  assert.equal(checkInResponseText({
    acknowledgement: "Thanks for sharing.", practical_tip: null, follow_up_question: null,
  }), "Thanks for sharing.");
  assert.equal(checkInResponseText({
    acknowledgement: "Thanks for sharing.", practical_tip: null, follow_up_question: "What happened next?",
  }), "Thanks for sharing. What happened next?");
});

test("microphone never falls back to remote recognition; TTS requires a local en-US voice", () => {
  assert.equal(getLocalRecognitionConstructor(), null);
  global.window = { isSecureContext: true, SpeechRecognition: function RemoteOnly() {} };
  assert.equal(getLocalRecognitionConstructor(), null);
  class Local {}
  Local.prototype.processLocally = false;
  Local.available = async () => "available";
  global.window.SpeechRecognition = Local;
  assert.equal(getLocalRecognitionConstructor(), Local);
  global.window.SpeechRecognition = function RemoteOnly() {};
  global.window.webkitSpeechRecognition = Local;
  assert.equal(getLocalRecognitionConstructor(), Local);
  global.window.isSecureContext = false;
  assert.equal(getLocalRecognitionConstructor(), null);
  delete global.window;
  const remote = { lang: "en-US", localService: false };
  const british = { lang: "en-GB", localService: true };
  const local = { lang: "en-US", localService: true };
  assert.equal(selectLocalEnglishVoice([remote, british]), undefined);
  assert.equal(selectLocalEnglishVoice([remote, british, local]), local);
});

test("local speech setup checks packs, verifies installation, and never enables remote speech", async () => {
  let notices = 0;
  let installs = 0;
  let checks = 0;
  let availability = "available";
  let installed = true;
  let readyAfterInstall = true;
  class Local {}
  Local.prototype.processLocally = false;
  Local.available = async (options) => {
    assert.deepEqual(options, { langs: ["en-US"], processLocally: true });
    checks++;
    return availability;
  };
  const install = async (options) => {
    assert.deepEqual(options, { langs: ["en-US"] });
    installs++;
    if (installed && readyAfterInstall) availability = "available";
    return installed;
  };
  Local.install = install;
  global.window = { isSecureContext: true, SpeechRecognition: Local };
  const prepare = () => prepareLocalRecognition("en-US", () => { notices++; });
  try {
    assert.equal(await prepare(), Local);
    assert.equal(installs, 0);
    for (const status of ["downloadable", "downloading"]) {
      availability = status;
      const previousChecks = checks;
      assert.equal(await prepare(), Local);
      assert.equal(checks - previousChecks, 2);
    }
    assert.equal(installs, 2);
    assert.equal(notices, 2);
    availability = "unavailable";
    await assert.rejects(prepare, /allowing microphone access alone will not fix/);
    assert.equal(installs, 2);
    availability = "downloadable";
    installed = false;
    await assert.rejects(prepare, /could not be installed/);
    installed = true;
    readyAfterInstall = false;
    await assert.rejects(prepare, /not ready yet/);
    delete Local.install;
    await assert.rejects(prepare, /cannot install/);
    Local.available = async () => { throw new DOMException("policy denied", "NotAllowedError"); };
    await assert.rejects(prepare, { name: "NotAllowedError" });
    global.window.SpeechRecognition = function RemoteOnly() {};
    await assert.rejects(prepare, /does not expose on-device/);
    global.window.isSecureContext = false;
    await assert.rejects(prepare, /HTTPS or localhost/);
  } finally {
    delete global.window;
  }
});

test("microphone failures provide actionable local-only recovery guidance", () => {
  assert.match(recognitionErrorMessage("not-allowed"), /site's browser permissions/);
  assert.equal(recognitionErrorMessage("NotAllowedError"), recognitionErrorMessage("not-allowed"));
  assert.match(recognitionErrorMessage("service-not-allowed"), /administrator/);
  assert.match(recognitionErrorMessage("audio-capture"), /Connect or enable/);
  assert.match(recognitionErrorMessage("language-not-supported"), /local US-English speech pack/);
  assert.match(recognitionErrorMessage("no-speech"), /input level/);
  assert.match(recognitionErrorMessage("network"), /will not switch to remote/);
  assert.match(recognitionErrorMessage("unknown-error"), /unknown-error/);
});
