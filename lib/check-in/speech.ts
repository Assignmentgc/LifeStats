import type { Analysis } from "./analysis";

export function checkInResponseText(analysis: Pick<Analysis, "acknowledgement" | "practical_tip" | "follow_up_question">): string {
  return [analysis.acknowledgement, analysis.practical_tip, analysis.follow_up_question]
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join(" ");
}

export type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
export type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
export type LocalRecognition = {
  lang: string;
  processLocally: boolean;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export type LocalRecognitionConstructor = {
  new(): LocalRecognition;
  prototype: LocalRecognition;
  available?(options: { langs: string[]; processLocally: true }): Promise<string>;
  install?(options: { langs: string[] }): Promise<boolean>;
};

export function getLocalRecognitionConstructor(): LocalRecognitionConstructor | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const browser = window as Window & {
    SpeechRecognition?: LocalRecognitionConstructor;
    webkitSpeechRecognition?: LocalRecognitionConstructor;
  };
  return [browser.SpeechRecognition, browser.webkitSpeechRecognition].find(
    (constructor) => constructor && "processLocally" in constructor.prototype && typeof constructor.available === "function",
  ) ?? null;
}

export async function prepareLocalRecognition(
  lang: string,
  onInstalling: () => void,
): Promise<LocalRecognitionConstructor> {
  if (typeof window === "undefined" || !window.isSecureContext) {
    throw new Error("On-device recognition requires HTTPS or localhost. Open the secure version of LifeStats and retry.");
  }
  const constructor = getLocalRecognitionConstructor();
  if (!constructor?.available) {
    throw new Error("This browser does not expose on-device speech recognition. Open LifeStats in an up-to-date browser with local speech support, outside an embedded preview. Microphone permission alone cannot enable this feature.");
  }
  const options = { langs: [lang], processLocally: true as const };
  const availability = await constructor.available(options);
  if (availability === "available") return constructor;
  if (availability !== "downloadable" && availability !== "downloading") {
    throw new Error("This browser reports that on-device US-English recognition is unavailable. It cannot currently provide the local speech pack; allowing microphone access alone will not fix this.");
  }
  if (!constructor.install) {
    throw new Error("The US-English speech pack is missing, and this browser cannot install it. Update your browser or use a browser with local speech-pack installation support.");
  }
  onInstalling();
  if (!await constructor.install({ langs: [lang] })) {
    throw new Error("The local US-English speech pack could not be installed. Check your internet connection and available disk space, then retry.");
  }
  if (await constructor.available(options) !== "available") {
    throw new Error("The US-English speech pack is not ready yet. Wait for the browser's download to finish, then retry.");
  }
  return constructor;
}

export function recognitionErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "NotAllowedError":
      return "Microphone or local speech access was blocked. Allow the microphone in this site's browser permissions and in your system privacy settings. If using an embedded preview, open LifeStats in a regular browser tab and retry.";
    case "service-not-allowed":
    case "SecurityError":
      return "Local speech recognition is blocked by browser or site policy. Open LifeStats in a regular browser tab; on a managed device, ask your administrator to allow on-device speech recognition.";
    case "audio-capture":
    case "NotFoundError":
      return "No usable microphone was found. Connect or enable a microphone, select it in browser settings, and close other apps that may be using it.";
    case "language-not-supported":
      return "The browser's local US-English speech pack is missing or unavailable. Retry the microphone setup to check or install it.";
    case "no-speech":
      return "No speech was detected. Check your microphone input level, then retry and speak after listening starts.";
    case "network":
      return "The browser reported a network error. Check connectivity if a local speech-pack download is needed, then retry. LifeStats will not switch to remote recognition.";
    default:
      return `On-device recognition stopped (${error}). Retry or type instead.`;
  }
}

export function selectLocalEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find((voice) => voice.localService && voice.lang.replace("_", "-").toLowerCase() === "en-us");
}
