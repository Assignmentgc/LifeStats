"use client";

import { Mic, Send, Sparkles, Square, Volume2 } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refreshCheckInViews } from "@/app/actions/check-in";
import { Button, Panel } from "@/components/ui";
import { SUBSTAT_META } from "@/lib/constants";
import { CHECK_IN_LOCALE, exclusionReason, isUuid, type CheckInResult } from "@/lib/check-in/analysis";
import { checkInResponseText, prepareLocalRecognition, recognitionErrorMessage, selectLocalEnglishVoice, type LocalRecognition } from "@/lib/check-in/speech";

export function CheckInForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceMessage, setVoiceMessage] = useState("Type in US English or use your keyboard's dictation. Audio is never uploaded by LifeStats.");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPreparingMic, setIsPreparingMic] = useState(false);
  const [showMicHelp, setShowMicHelp] = useState(false);
  const [interim, setInterim] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const session = useRef<{ id: string; timezone: string } | null>(null);
  const pendingRequest = useRef<{ content: string; id: string } | null>(null);
  const recognition = useRef<LocalRecognition | null>(null);
  const contentInput = useRef<HTMLTextAreaElement | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const followUpQuestion = result?.analysis.follow_up_question;

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
          const payload = await response.json() as (CheckInResult & { session_id: string }) | { error: string } | { entry_id: null };
          if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Could not restore the check-in session.");
          if (!mounted.current) return;
          if (payload.entry_id !== null) {
            if (!isUuid(payload.session_id)) throw new Error("Could not restore the saved check-in session.");
            session.current = { id: payload.session_id, timezone: payload.timezone };
            setResult(payload);
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
    utterance.onerror = (event) => {
      if (mounted.current && event.error !== "interrupted" && event.error !== "canceled") setVoiceMessage("Speech playback failed. Use Read response to retry.");
    };
    window.speechSynthesis.speak(utterance);
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
    setContent("");
    setError(null);
    contentInput.current?.focus();
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
      <Panel className="check-in-guide" inset>
        <div className="check-in-guide__icon" aria-hidden="true"><Sparkles size={18} /></div>
        <div>
          <h2>Hey! I&apos;m here to notice your progress.</h2>
          <p>Describe today&apos;s actions and experiences in US English. Review your text before sending. Eligible gains update your stats as soon as your check-in is saved.</p>
        </div>
      </Panel>
      <form className="check-in-form" onSubmit={submitCheckIn}>
        <div className="check-in-voice-controls">
          {isListening ? (
            <Button onClick={() => recognition.current?.stop()}><Square aria-hidden="true" size={15} /> Stop microphone</Button>
          ) : (
            <Button disabled={isSubmitting || !sessionReady} loading={isPreparingMic} onClick={startMicrophone}>
              <Mic aria-hidden="true" size={15} /> On-device microphone
            </Button>
          )}
          <label><input type="checkbox" checked={readAloud} onChange={(event) => {
            setReadAloud(event.target.checked);
            if (!event.target.checked && "speechSynthesis" in window) window.speechSynthesis.cancel();
          }} /> Read responses aloud</label>
        </div>
        <p className="check-in-result__quiet" role="status">{voiceMessage}</p>
        {showMicHelp ? (
          <div className="check-in-result__quiet">
            <strong>On-device microphone setup</strong>
            <ol>
              <li>Open this page in a regular, up-to-date desktop browser, not an embedded editor preview. Local speech support varies by browser and device; ordinary speech recognition support is not enough.</li>
              <li>Use HTTPS or localhost. If the browser offers a US-English speech-pack download, let it finish. An unavailable pack cannot be fixed by changing microphone permissions.</li>
              <li>When prompted, allow microphone access for this site. On Windows, also enable microphone access for desktop apps under Settings &gt; Privacy &amp; security &gt; Microphone.</li>
              <li>Click On-device microphone again to retry. If local speech is still unavailable, type your check-in or use keyboard dictation (Windows: Win+H; its privacy behavior is controlled by Windows, not LifeStats).</li>
            </ol>
            <p>LifeStats does not upload microphone audio or fall back to remote recognition. Your editable text remains available.</p>
          </div>
        ) : null}
        {interim ? <p className="check-in-result__quiet" aria-live="polite">Listening: {interim}</p> : null}
        {followUpQuestion ? (
          <div id="check-in-follow-up">
            <p className="eyebrow">Follow-up question</p>
            <p>{followUpQuestion}</p>
            <p className="check-in-result__quiet">Reply below by typing or using the on-device microphone. Your reply is saved in this check-in session; you do not need to repeat your original entry.</p>
          </div>
        ) : null}
        <label className="field" htmlFor="check-in-content">
          <span className="field__label">{followUpQuestion ? "Your follow-up response (US English)" : "Your day / editable transcript (US English)"}</span>
          <textarea className="textarea check-in-form__textarea" id="check-in-content" lang="en-US"
            ref={contentInput} aria-describedby={followUpQuestion ? "check-in-follow-up" : undefined}
            maxLength={5000} disabled={isSubmitting || isListening || isPreparingMic}
            onChange={(event) => setContent(event.target.value)}
            placeholder={followUpQuestion ? "Type your answer to the follow-up question here..." : "Today I went for a run before work, finished a difficult project, and called my sister..."}
            value={content} />
        </label>
        <label className="check-in-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          I agree to send this text and compact check-in context to Perplexity for analysis. LifeStats does not upload microphone audio.
        </label>
        <div className="check-in-form__footer">
          <span>{content.length}/5,000</span>
          <Button disabled={!sessionReady || !consent || content.trim().length < 3 || isListening || isPreparingMic} loading={isSubmitting} type="submit" variant="primary">
            <Send aria-hidden="true" size={15} /> {followUpQuestion ? "Send follow-up response" : "Save check-in"}
          </Button>
        </div>
      </form>
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      {result ? (
        <Panel className="check-in-result">
          <p className="eyebrow">Evidence saved - {result.local_day}</p>
          <div className="check-in-voice-controls">
            <Button disabled={isSubmitting || isListening || isPreparingMic} size="sm" variant="primary" onClick={startNewCheckIn}>Start a new check-in</Button>
            <Link className="section-link" href="/journal">View saved entries</Link>
            <Link className="section-link" href="/stats">View updated substats</Link>
          </div>
          <h2>{result.analysis.acknowledgement}</h2>
          <p className="check-in-result__quiet">Each actually applied check-in point earns 1 XP. Daily habits also earn XP. Your Dashboard shows your updated total and level.</p>
          {result.analysis.safety_flags.some((flag) => flag === "self_harm" || flag === "immediate_danger") ? (
            <p role="alert">If you are in immediate danger, call 911. In the US, call or text 988 for crisis support. This app is not an emergency or medical service.</p>
          ) : null}
          {result.analysis.safety_flags.length ? <p className="check-in-result__quiet">Safety-sensitive entry: no evidence from this entry will change your scores.</p> : null}
          {result.analysis.normalized_english ? <details><summary>English-normalized text</summary><p>{result.analysis.normalized_english}</p></details> : null}
          {result.analysis.practical_tip ? <div><p className="eyebrow">A practical tip</p><p>{result.analysis.practical_tip}</p></div> : null}
          {followUpQuestion ? (
            <div>
              <p>{followUpQuestion}</p>
              <Button disabled={isSubmitting || isListening || isPreparingMic} size="sm" onClick={() => {
                contentInput.current?.focus();
                contentInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}>Answer follow-up</Button>
            </div>
          ) : null}
          <div className="check-in-voice-controls">
            <Button disabled={isListening || isPreparingMic} size="sm" onClick={() => speak(checkInResponseText(result.analysis))}><Volume2 aria-hidden="true" size={15} /> Read response</Button>
            <Button size="sm" onClick={() => {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            }}>Stop speech</Button>
          </div>
          <p className="check-in-result__quiet">Your Character Stats show cumulative category points and the points added by your latest check-in. Daily gains are capped at +5 per substat across sessions; lifetime category totals keep growing. Repeated activities, recognized completed quests, and ineligible evidence do not award extra points or XP. No penalties.</p>
          {result.analysis.evidence.length ? (
            <div><p className="eyebrow">Activities detected</p>
              <ul>{result.analysis.evidence.map((item, index) => (
                <li key={index}>{SUBSTAT_META[item.substat_id].label}: {item.observation} ({Math.round(item.confidence * 100)}% estimated confidence)
                  {item.proposed_gain !== null ? ` - proposed +${item.proposed_gain}, subject to daily cap` : ""}
                  {exclusionReason(result.analysis, item) ? ` - not scored: ${exclusionReason(result.analysis, item)}` : ""}</li>
              ))}</ul>
              <p className="check-in-result__quiet">Confidence is a model estimate, not a calibrated probability. Low-confidence evidence is saved but not scored.</p>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
