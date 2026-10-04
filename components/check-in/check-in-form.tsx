"use client";

import { Mic, Send, Square, Volume2 } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refreshCheckInViews } from "@/app/actions/check-in";
import { Button, Panel } from "@/components/ui";
import { SUBSTAT_META } from "@/lib/constants";
import { CHECK_IN_LOCALE, exclusionReason, isUuid, type CheckInResult, type CheckInTurn } from "@/lib/check-in/analysis";
import { checkInResponseText, getLocalRecognitionConstructor, prepareLocalRecognition, recognitionErrorMessage, selectLocalEnglishVoice, type LocalRecognition } from "@/lib/check-in/speech";

const NOT_SCORED_REASONS: Record<string, string> = {
  language: "needs clarification",
  safety: "safety-sensitive",
  low_confidence: "low confidence",
  historical: "past event",
  planned: "planned, not done yet",
  unclear: "unclear timing",
  quest: "already counted as a quest",
  non_positive: "not a gain",
};

type RestoredCheckIn = CheckInResult & { session_id: string; turns?: CheckInTurn[] };

function formatPoints(value: number) {
  return String(Math.round(value * 100) / 100);
}

export function CheckInForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPreparingMic, setIsPreparingMic] = useState(false);
  const [showMicHelp, setShowMicHelp] = useState(false);
  const [interim, setInterim] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [consent, setConsent] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [followUpSkipped, setFollowUpSkipped] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [dictation, setDictation] = useState<"checking" | "ready" | "unavailable">("checking");
  const [turns, setTurns] = useState<CheckInTurn[]>([]);
  const session = useRef<{ id: string; timezone: string } | null>(null);
  const pendingRequest = useRef<{ content: string; id: string } | null>(null);
  const recognition = useRef<LocalRecognition | null>(null);
  const contentInput = useRef<HTMLTextAreaElement | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const latestTurn = useRef<HTMLElement | null>(null);
  const scrollPending = useRef(false);
  const followUpQuestion = result && !followUpSkipped ? result.analysis.follow_up_question : null;
  const showComposer = !result || Boolean(followUpQuestion);
  const earned = result?.daily_scores.filter((score) => score.applied_change > 0) ?? [];
  const thread: CheckInTurn[] = turns.length ? turns : result ? [{ id: result.entry_id, content: "", analysis: result.analysis }] : [];

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    try {
      const key = `lifestats-check-in-session:${userId}`;
      const saved = sessionStorage.getItem(key);
      const id = isUuid(saved) ? saved : crypto.randomUUID();
      session.current = { id, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      const historyUrl = isUuid(saved) ? `/api/check-in?session_id=${encodeURIComponent(saved)}` : "/api/check-in";
      fetch(historyUrl, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json() as RestoredCheckIn | { error: string } | { entry_id: null };
          if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Could not restore the check-in session.");
          if (!mounted.current) return;
          if (payload.entry_id !== null) {
            if (!isUuid(payload.session_id)) throw new Error("Could not restore the saved check-in session.");
            session.current = { id: payload.session_id, timezone: payload.timezone };
            setResult(payload);
            setTurns((payload.turns ?? []).filter((turn) => typeof turn?.analysis?.acknowledgement === "string"));
          }
          sessionStorage.setItem(key, payload.entry_id === null ? id : payload.session_id);
        })
        .catch((failure: unknown) => {
          if (mounted.current && !(failure instanceof Error && failure.name === "AbortError")) {
            setError(failure instanceof Error ? failure.message : "Could not restore the check-in session.");
          }
        })
        .finally(() => {
          if (mounted.current) setSessionReady(true);
        });
    } catch {
      setError("Session storage is unavailable. Enable it and reload to submit a check-in.");
    }
    return () => {
      mounted.current = false;
      controller.abort();
      recognition.current?.abort();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [userId]);

  // Only offer dictation where on-device recognition can work; elsewhere it would always fail.
  useEffect(() => {
    let cancelled = false;
    const constructor = getLocalRecognitionConstructor();
    if (!constructor?.available) {
      setDictation("unavailable");
      return;
    }
    constructor.available({ langs: [CHECK_IN_LOCALE], processLocally: true })
      .then((availability) => { if (!cancelled) setDictation(availability === "unavailable" ? "unavailable" : "ready"); })
      .catch(() => { if (!cancelled) setDictation("ready"); });
    return () => { cancelled = true; };
  }, []);

  // After a reply is saved, bring the new response into view instead of leaving the reader at the reply box.
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    const node = latestTurn.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    node.focus({ preventScroll: true });
  }, [turns]);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setVoiceMessage("Speech playback is unavailable. Your response is shown below.");
      return;
    }
    const voice = selectLocalEnglishVoice(window.speechSynthesis.getVoices());
    if (!voice) {
      setVoiceMessage("No local US-English voice is available. Install an en-US system voice or read the response below.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = CHECK_IN_LOCALE;
    utterance.voice = voice;
    utterance.onstart = () => { if (mounted.current) setIsSpeaking(true); };
    utterance.onend = () => { if (mounted.current) setIsSpeaking(false); };
    utterance.onerror = (event) => {
      if (mounted.current) setIsSpeaking(false);
      if (mounted.current && event.error !== "interrupted" && event.error !== "canceled") setVoiceMessage("Speech playback failed. Use Read response to retry.");
    };
    window.speechSynthesis.speak(utterance);
  }

  function toggleSpeech() {
    if (!result) return;
    if (isSpeaking && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    speak(checkInResponseText(result.analysis));
  }

  function skipFollowUp() {
    setFollowUpSkipped(true);
    setContent("");
    setError(null);
  }

  async function startMicrophone() {
    if (busy.current || isPreparingMic || isListening) return;
    setIsPreparingMic(true);
    setShowMicHelp(false);
    setVoiceMessage("Checking the on-device US-English speech pack...");
    try {
      const constructor = await prepareLocalRecognition(CHECK_IN_LOCALE, () => {
        if (mounted.current) setVoiceMessage("Installing the browser's on-device US-English speech pack...");
      });
      if (!mounted.current) return;
      const instance = new constructor();
      instance.lang = CHECK_IN_LOCALE;
      instance.processLocally = true;
      instance.continuous = true;
      instance.interimResults = true;
      const baseline = content.trim();
      instance.onresult = (event) => {
        if (!mounted.current) return;
        const final: string[] = [];
        const partial: string[] = [];
        for (let index = 0; index < event.results.length; index++) {
          const item = event.results[index];
          (item.isFinal ? final : partial).push(item[0].transcript);
        }
        const transcript = [baseline, ...final].filter(Boolean).join(" ");
        if (transcript.length > 5000) {
          instance.stop();
          setVoiceMessage("The transcript exceeded 5,000 characters. The last accepted text is preserved; shorten it before continuing.");
          return;
        }
        setContent(transcript);
        setInterim(partial.join(" "));
      };
      instance.onerror = (event) => {
        if (!mounted.current) return;
        setVoiceMessage(`${recognitionErrorMessage(event.error)} Your transcript is preserved.`);
        setShowMicHelp(true);
        instance.abort();
      };
      instance.onend = () => {
        if (!mounted.current || recognition.current !== instance) return;
        recognition.current = null;
        setIsListening(false);
        setInterim("");
      };
      recognition.current = instance;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      instance.start();
      setIsListening(true);
      setVoiceMessage("Listening on-device in US English. Stop recording, then review and edit the transcript before sending.");
    } catch (failure) {
      if (!mounted.current) return;
      setVoiceMessage(failure instanceof DOMException ? recognitionErrorMessage(failure.name)
        : failure instanceof Error ? failure.message : "Could not start on-device recognition. Retry or type instead.");
      setShowMicHelp(true);
      recognition.current?.abort();
      recognition.current = null;
      setIsListening(false);
    } finally {
      if (mounted.current) setIsPreparingMic(false);
    }
  }

  function startNewCheckIn() {
    if (busy.current || isListening || isPreparingMic || !session.current) return;
    const id = crypto.randomUUID();
    session.current = { id, timezone: session.current.timezone };
    try {
      sessionStorage.setItem(`lifestats-check-in-session:${userId}`, id);
    } catch {
      // The in-memory session still works for this visit.
    }
    pendingRequest.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setResult(null);
    setTurns([]);
    setFollowUpSkipped(false);
    setIsSpeaking(false);
    setContent("");
    setError(null);
    setTimeout(() => contentInput.current?.focus(), 0);
  }

  async function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !session.current || isListening || isPreparingMic || !consent || content.trim().length < 3) return;
    busy.current = true;
    setIsSubmitting(true);
    setError(null);
    const finalText = content.trim();
    if (pendingRequest.current?.content !== finalText) pendingRequest.current = { content: finalText, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: finalText, session_id: session.current.id, request_id: pendingRequest.current.id,
          locale: CHECK_IN_LOCALE, timezone: session.current.timezone, consent_version: "perplexity-text-v1",
        }),
      });
      const payload = await response.json() as CheckInResult | { error: string };
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Your check-in could not be processed.");
      setResult(payload);
      if (!turns.some((turn) => turn.id === payload.entry_id)) {
        setTurns([...turns, { id: payload.entry_id, content: finalText, analysis: payload.analysis }]);
      }
      scrollPending.current = true;
      setFollowUpSkipped(false);
      setContent("");
      pendingRequest.current = null;
      try {
        const refreshed = await refreshCheckInViews();
        if ("error" in refreshed) setError(refreshed.error ?? "Your check-in was saved, but the views could not be refreshed. Reload to see updated stats.");
      } catch {
        setError("Your check-in was saved, but the views could not be refreshed. Reload to see updated stats.");
      }
      if (readAloud) speak(checkInResponseText(payload.analysis));
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your check-in could not be processed. Your text is preserved.");
    } finally {
      busy.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="check-in-layout">
      {thread.map((turn, index) => {
        const isLatest = index === thread.length - 1;
        return (
          <section aria-label={isLatest ? "Latest response" : undefined} className="check-in-turn" key={turn.id} ref={isLatest ? latestTurn : undefined} tabIndex={isLatest ? -1 : undefined}>
            {turn.content ? <div className="check-in-bubble"><p className="eyebrow">You</p><p>{turn.content}</p></div> : null}
            {isLatest && result ? (
              <Panel className="check-in-result">
                <h2>{result.analysis.acknowledgement}</h2>
                {earned.length ? (
                  <div>
                    <p className="eyebrow">Points today</p>
                    <ul className="check-in-points">
                      {earned.map((score) => (
                        <li key={score.substat_id}>
                          <span>{SUBSTAT_META[score.substat_id]?.label ?? score.substat_id}</span>
                          <strong>+{formatPoints(score.applied_change)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <p className="check-in-result__quiet">No new points from this entry.</p>}
                {result.analysis.safety_flags.some((flag) => flag === "self_harm" || flag === "immediate_danger") ? (
                  <p role="alert">If you are in immediate danger, call 911. In the US, call or text 988 for crisis support. This app is not an emergency or medical service.</p>
                ) : null}
                {result.analysis.safety_flags.length ? <p className="check-in-result__quiet">Safety-sensitive entry: no evidence from this entry will change your scores.</p> : null}
                {result.analysis.practical_tip ? <p className="check-in-tip"><strong>Tip:</strong> {result.analysis.practical_tip}</p> : null}
                <div className="check-in-result__actions">
                  <Button disabled={isListening || isPreparingMic} size="sm" onClick={toggleSpeech}>
                    {isSpeaking ? <><Square aria-hidden="true" size={14} /> Stop</> : <><Volume2 aria-hidden="true" size={14} /> Read aloud</>}
                  </Button>
                  <Button disabled={isSubmitting || isListening || isPreparingMic} size="sm" variant={followUpQuestion ? "secondary" : "primary"} onClick={startNewCheckIn}>Start a new check-in</Button>
                  <Link className="section-link" href="/journal">Journal</Link>
                  <Link className="section-link" href="/stats">Stats</Link>
                </div>
                <details className="check-in-details">
                  <summary>How this was scored</summary>
                  <p className="check-in-result__quiet">Each applied point earns 1 XP. Gains are capped at +5 per skill per day, and your totals never go down. Plans, past events, repeats and low-confidence entries are saved but not scored. Confidence is a model estimate, not a calibrated probability.</p>
                  {result.analysis.evidence.length ? (
                    <ul className="check-in-evidence">
                      {result.analysis.evidence.map((item, index) => {
                        const reason = exclusionReason(result.analysis, item);
                        return (
                          <li key={index}>
                            <strong>{SUBSTAT_META[item.substat_id]?.label ?? item.substat_id}</strong>: {item.observation} ({Math.round(item.confidence * 100)}% confident)
                            {reason ? ` \u2014 not scored: ${NOT_SCORED_REASONS[reason] ?? reason}` : item.proposed_gain !== null ? ` \u2014 up to +${item.proposed_gain}` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="check-in-result__quiet">No activities were detected in this entry.</p>}
                  {result.analysis.normalized_english ? <p className="check-in-result__quiet">English-normalized text: {result.analysis.normalized_english}</p> : null}
                </details>
              </Panel>
            ) : (
              <Panel className="check-in-result check-in-result--earlier">
                <p className="check-in-turn__ack">{turn.analysis.acknowledgement}</p>
                {turn.analysis.practical_tip ? <p className="check-in-tip"><strong>Tip:</strong> {turn.analysis.practical_tip}</p> : null}
                {turn.analysis.follow_up_question ? <p className="check-in-result__quiet">Follow-up asked: {turn.analysis.follow_up_question}</p> : null}
              </Panel>
            )}
          </section>
        );
      })}
      {showComposer ? (
        <form className="check-in-form" onSubmit={submitCheckIn}>
          {followUpQuestion ? (
            <div className="check-in-followup" id="check-in-follow-up">
              <p className="eyebrow">Optional follow-up</p>
              <p>{followUpQuestion}</p>
            </div>
          ) : null}
          <label className="field" htmlFor="check-in-content">
            <span className="field__label">{followUpQuestion ? "Your reply" : "What did you do today?"}</span>
            <textarea className="textarea check-in-form__textarea" id="check-in-content" lang="en-US"
              ref={contentInput} aria-describedby={followUpQuestion ? "check-in-follow-up" : undefined}
              maxLength={5000} disabled={isSubmitting || isListening || isPreparingMic}
              onChange={(event) => setContent(event.target.value)}
              placeholder={followUpQuestion ? "Type your reply here..." : "I went for a run before work, finished a hard project, and called my sister..."}
              value={content} />
          </label>
          <div className="check-in-toolbar">
            <div className="check-in-voice-controls">
              {dictation === "ready" ? (isListening ? (
                <Button size="sm" onClick={() => recognition.current?.stop()}><Square aria-hidden="true" size={14} /> Stop</Button>
              ) : (
                <Button aria-label="Dictate with the on-device microphone" disabled={isSubmitting || !sessionReady} loading={isPreparingMic} loadingText="Checking microphone…" size="sm" onClick={startMicrophone}>
                  <Mic aria-hidden="true" size={14} /> Dictate
                </Button>
              )) : null}
              <label className="check-in-toggle"><input type="checkbox" checked={readAloud} onChange={(event) => {
                setReadAloud(event.target.checked);
                if (!event.target.checked && "speechSynthesis" in window) window.speechSynthesis.cancel();
              }} /> Read replies aloud</label>
              {dictation === "unavailable" ? <span className="check-in-count">Tip: use your keyboard&apos;s microphone key to dictate.</span> : null}
            </div>
            <span className="check-in-count">{content.length}/5,000</span>
          </div>
          <p className="check-in-result__quiet check-in-voice-status" role="status">{voiceMessage}</p>
          {interim ? <p className="check-in-result__quiet" aria-live="polite">Listening: {interim}</p> : null}
          {showMicHelp ? (
            <details className="check-in-details" open>
              <summary>Dictation setup</summary>
              <ol>
                <li>Use an up-to-date browser with on-device speech support, in a regular tab rather than an embedded preview, and allow the microphone when asked.</li>
                <li>If your browser offers a US-English speech pack, let it finish downloading. Microphone permission alone cannot fix a missing pack.</li>
                <li>Or just type, or use your device&apos;s keyboard dictation: Windows Win+H, Mac Edit &gt; Start Dictation, or the microphone key on an iPhone, iPad or Android keyboard. Your device handles that audio, not LifeStats.</li>
              </ol>
              <p className="check-in-result__quiet">LifeStats never uploads audio or falls back to remote recognition.</p>
            </details>
          ) : null}
          <label className="check-in-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            Send this text and brief check-in context to an AI service for analysis. Audio stays on your device.
          </label>
          <div className="check-in-actions">
            {followUpQuestion ? <Button disabled={isSubmitting || isListening || isPreparingMic} onClick={skipFollowUp}>Skip</Button> : null}
            <Button disabled={!sessionReady || !consent || content.trim().length < 3 || isListening || isPreparingMic} loading={isSubmitting} loadingText="Saving…" type="submit" variant="primary">
              <Send aria-hidden="true" size={15} /> {followUpQuestion ? "Send reply" : "Save check-in"}
            </Button>
          </div>
        </form>
      ) : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    </div>
  );
}
