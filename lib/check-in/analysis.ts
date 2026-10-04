import { SUBSTAT_IDS, type SubstatId } from "../constants";

export const CHECK_IN_LOCALE = "en-US";
export const MIN_EVIDENCE_CONFIDENCE = 0.8;
export const MAX_EVIDENCE_ITEMS = 12;
export const SAFETY_FLAGS = ["self_harm", "immediate_danger", "unsafe_behavior", "medical_advice"] as const;
export type SafetyFlag = (typeof SAFETY_FLAGS)[number];
export type Evidence = {
  substat_id: SubstatId;
  source_quote: string;
  observation: string;
  activity_key: string;
  direction: "positive" | "negative";
  proposed_gain: number | null;
  time_reference: "today" | "historical" | "planned" | "unclear";
  confidence: number;
  linked_quest_id: string | null;
};
export type Analysis = {
  schema_version: "2";
  language_status: "english" | "needs_clarification";
  normalized_english: string;
  evidence: Evidence[];
  acknowledgement: string;
  practical_tip: string | null;
  follow_up_question: string | null;
  confidence: number;
  safety_flags: SafetyFlag[];
};
export type SessionIndicator = {
  substat_id: SubstatId;
  pending_change: number;
  evidence_count: number;
};
export type CheckInTurn = { id: string; content: string; analysis: Analysis; created_at?: string };
export type CheckInResult = {
  entry_id: string;
  local_day: string;
  timezone: string;
  analysis: Analysis;
  session_indicators: SessionIndicator[];
  scoring_mode: "immediate";
  daily_scores: { substat_id: SubstatId; applied_change: number; daily_allowance_used: number }[];
};

export const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "language_status", "normalized_english", "evidence", "acknowledgement", "practical_tip", "follow_up_question", "confidence", "safety_flags"],
  properties: {
    schema_version: { type: "string", enum: ["2"] },
    language_status: { type: "string", enum: ["english", "needs_clarification"] },
    normalized_english: { type: "string" },
    acknowledgement: { type: "string" },
    practical_tip: { type: ["string", "null"] },
    follow_up_question: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    safety_flags: { type: "array", items: { type: "string", enum: SAFETY_FLAGS } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["substat_id", "source_quote", "observation", "activity_key", "direction", "proposed_gain", "time_reference", "confidence", "linked_quest_id"],
        properties: {
          substat_id: { type: "string", enum: SUBSTAT_IDS },
          source_quote: { type: "string" },
          observation: { type: "string" },
          activity_key: { type: "string" },
          direction: { type: "string", enum: ["positive", "negative"] },
          proposed_gain: { type: ["number", "null"], minimum: 1, maximum: 5 },
          time_reference: { type: "string", enum: ["today", "historical", "planned", "unclear"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          linked_quest_id: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export class CheckInError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = "CheckInError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function dayInTimezone(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) invalidAnalysis();
}

function invalidAnalysis(): never {
  throw new CheckInError("The AI returned an invalid analysis. Your entry was not saved; please try again.", 502, "invalid_analysis");
}

function text(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) invalidAnalysis();
  return value;
}

function confidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) invalidAnalysis();
  return value;
}

export function validateAnalysis(value: unknown, content: string, spiritualityEnabled: boolean, questIds: Set<string>): Analysis {
  if (!isRecord(value)) invalidAnalysis();
  exactKeys(value, analysisSchema.required);
  if (value.schema_version !== "2" || (value.language_status !== "english" && value.language_status !== "needs_clarification")) invalidAnalysis();
  if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_ITEMS || !Array.isArray(value.safety_flags)) invalidAnalysis();
  const safetyFlags: SafetyFlag[] = value.safety_flags.map((flag: unknown) => {
    if (typeof flag !== "string" || !SAFETY_FLAGS.includes(flag as SafetyFlag)) invalidAnalysis();
    return flag as SafetyFlag;
  });
  if (new Set(safetyFlags).size !== safetyFlags.length) invalidAnalysis();
  const languageStatus = value.language_status as Analysis["language_status"];
  const normalized = text(value.normalized_english, 5000, languageStatus === "needs_clarification");
  const question = value.follow_up_question === null ? null : text(value.follow_up_question, 240);
  const practicalTip = value.practical_tip === null ? null : text(value.practical_tip, 300);
  if ((languageStatus === "needs_clarification" || safetyFlags.length > 0) && practicalTip !== null) invalidAnalysis();
  if (question && ((question.match(/\?/g) ?? []).length !== 1 || !question.trim().endsWith("?"))) invalidAnalysis();
  if (languageStatus === "needs_clarification" && (value.evidence.length || !question || normalized !== "")) invalidAnalysis();
  const evidence: Evidence[] = value.evidence.map((item: unknown) => {
    if (!isRecord(item)) invalidAnalysis();
    exactKeys(item, analysisSchema.properties.evidence.items.required);
    if (typeof item.substat_id !== "string" || !SUBSTAT_IDS.includes(item.substat_id as SubstatId)) invalidAnalysis();
    const substatId = item.substat_id as SubstatId;
    if (substatId === "spirituality" && !spiritualityEnabled) invalidAnalysis();
    const quote = text(item.source_quote, 500);
    if (!content.includes(quote)) invalidAnalysis();
    const key = text(item.activity_key, 80);
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(key)) invalidAnalysis();
    if (item.direction !== "positive" && item.direction !== "negative") invalidAnalysis();
    if (item.direction === "negative") {
      if (item.proposed_gain !== null) invalidAnalysis();
    } else if (typeof item.proposed_gain !== "number" || !Number.isFinite(item.proposed_gain) || item.proposed_gain < 1 || item.proposed_gain > 5) {
      invalidAnalysis();
    }
    if (typeof item.time_reference !== "string" || !["today", "historical", "planned", "unclear"].includes(item.time_reference)) invalidAnalysis();
    if (item.linked_quest_id !== null && (typeof item.linked_quest_id !== "string" || !questIds.has(item.linked_quest_id))) invalidAnalysis();
    return {
      substat_id: substatId,
      source_quote: quote,
      observation: text(item.observation, 240),
      activity_key: key,
      direction: item.direction,
      proposed_gain: item.proposed_gain === null ? null : Math.round(item.proposed_gain * 100) / 100,
      time_reference: item.time_reference as Evidence["time_reference"],
      confidence: confidence(item.confidence),
      linked_quest_id: item.linked_quest_id as string | null,
    };
  });
  return {
    schema_version: "2",
    language_status: languageStatus,
    normalized_english: normalized,
    evidence,
    acknowledgement: text(value.acknowledgement, 500),
    practical_tip: practicalTip,
    follow_up_question: question,
    confidence: confidence(value.confidence),
    safety_flags: safetyFlags,
  };
}

export function exclusionReason(analysis: Analysis, evidence: Evidence): string | null {
  if (analysis.language_status !== "english") return "language";
  if (analysis.safety_flags.length) return "safety";
  if (analysis.confidence < MIN_EVIDENCE_CONFIDENCE || evidence.confidence < MIN_EVIDENCE_CONFIDENCE) return "low_confidence";
  if (evidence.time_reference !== "today") return evidence.time_reference;
  if (evidence.linked_quest_id) return "quest";
  if (evidence.direction !== "positive") return "non_positive";
  return null;
}

export function parseCheckInRequest(value: unknown) {
  if (!isRecord(value) || typeof value.content !== "string" || value.content.trim().length < 3 || value.content.trim().length > 5000) {
    throw new CheckInError("Your check-in must be between 3 and 5,000 characters.", 400, "invalid_input");
  }
  if (!isUuid(value.session_id) || !isUuid(value.request_id)) {
    throw new CheckInError("The check-in session is invalid. Reload the page and try again.", 400, "invalid_session");
  }
  if (value.locale !== CHECK_IN_LOCALE) throw new CheckInError("Only US English is supported for now.", 400, "unsupported_locale");
  if (value.consent_version !== "perplexity-text-v1") {
    throw new CheckInError("Please agree to AI text analysis before submitting.", 400, "consent_required");
  }
  if (typeof value.timezone !== "string" || value.timezone.length > 80) throw new CheckInError("Select a valid device timezone.", 400, "invalid_timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format();
  } catch {
    throw new CheckInError("Select a valid device timezone.", 400, "invalid_timezone");
  }
  return { content: value.content.trim(), sessionId: value.session_id, requestId: value.request_id, timezone: value.timezone };
}
