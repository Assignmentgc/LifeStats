import { NextResponse } from "next/server";
import { DEFAULT_LIFESTATS_SETTINGS, SUBSTAT_IDS, SUBSTAT_META, type SubstatId } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Adjustment = {
  substat_id: SubstatId;
  change: number;
  reason: string;
};

type AiAnalysis = {
  summary: string;
  adjustments: Adjustment[];
  qol_score: number;
};

const analysisSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    qol_score: { type: "integer", minimum: 0, maximum: 100 },
    adjustments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          substat_id: { type: "string", enum: SUBSTAT_IDS },
          change: { type: "integer", minimum: -5, maximum: 5 },
          reason: { type: "string" },
        },
        required: ["substat_id", "change", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "adjustments", "qol_score"],
  additionalProperties: false,
} as const;

function isConfiguredKey(key: string | undefined) {
  return Boolean(key && !key.includes("dummy") && !key.includes("replace-me"));
}

function validateAnalysis(value: unknown): AiAnalysis {
  if (!value || typeof value !== "object") throw new Error("The AI returned an invalid analysis.");
  const analysis = value as Partial<AiAnalysis>;
  const qolScore = analysis.qol_score;
  if (typeof analysis.summary !== "string" || !Array.isArray(analysis.adjustments) || !Number.isInteger(qolScore) || typeof qolScore !== "number" || qolScore < 0 || qolScore > 100) {
    throw new Error("The AI returned an invalid analysis.");
  }

  const changes = new Map<SubstatId, Adjustment>();
  for (const item of analysis.adjustments) {
    if (!item || typeof item !== "object") continue;
    const adjustment = item as Partial<Adjustment>;
    const change = adjustment.change;
    if (!SUBSTAT_IDS.includes(adjustment.substat_id as SubstatId) || typeof change !== "number" || !Number.isInteger(change) || Math.abs(change) > 5) continue;

    const substatId = adjustment.substat_id as SubstatId;
    const previous = changes.get(substatId);
    changes.set(substatId, {
      substat_id: substatId,
      change: Math.max(-5, Math.min(5, (previous?.change ?? 0) + change)),
      reason: typeof adjustment.reason === "string" ? adjustment.reason.slice(0, 240) : "",
    });
  }

  return {
    summary: analysis.summary.trim().slice(0, 500),
    adjustments: [...changes.values()].filter((adjustment) => adjustment.change !== 0),
    qol_score: qolScore,
  };
}

function buildWellbeingContext(
  journals: { content: string; mood: string | null; created_at: string }[],
  checkIns: { content: string; summary: string; created_at: string }[],
) {
  const recentJournals = journals.map((entry) => `Journal (${entry.created_at.slice(0, 10)}, mood: ${entry.mood ?? "not recorded"}): ${entry.content.slice(0, 700)}`);
  const recentCheckIns = checkIns.map((entry) => `Earlier check-in (${entry.created_at.slice(0, 10)}): ${entry.content.slice(0, 700)} | Summary: ${entry.summary.slice(0, 300)}`);
  return [...recentJournals, ...recentCheckIns].join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (content.length < 3 || content.length > 5000) {
      return NextResponse.json({ error: "Your check-in must be between 3 and 5,000 characters." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to submit a check-in." }, { status: 401 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!isConfiguredKey(apiKey)) {
      return NextResponse.json({ error: "AI check-ins are ready, but need your real API key before they can update stats." }, { status: 503 });
    }

    const contextSince = new Date();
    contextSince.setUTCDate(contextSince.getUTCDate() - 30);
    const [journalsResult, checkInsResult] = await Promise.all([
      supabase.from("journal_entries").select("content, mood, created_at").gte("created_at", contextSince.toISOString()).order("created_at", { ascending: false }).limit(20),
      supabase.from("ai_check_ins").select("content, summary, created_at").gte("created_at", contextSince.toISOString()).order("created_at", { ascending: false }).limit(20),
    ]);
    if (journalsResult.error || checkInsResult.error) throw new Error("Could not load wellbeing context.");
    const { data: settingsData, error: settingsError } = await supabase.from("lifestats_settings").select("spirituality_enabled").maybeSingle();
    if (settingsError) throw new Error("Could not load LifeStats settings.");
    const spiritualityEnabled = settingsData?.spirituality_enabled ?? DEFAULT_LIFESTATS_SETTINGS.spiritualityEnabled;
    const wellbeingContext = buildWellbeingContext(journalsResult.data ?? [], checkInsResult.data ?? []);

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        store: false,
        instructions: `You are LifeStats' encouraging, grounded daily check-in guide. Analyze only the user's stated actions and experiences. Return JSON matching the schema. Each adjustment must target one direct substat and include a concise evidence-based reason. Award small, conservative changes from -5 to +5 total per substat. Do not invent facts, diagnose health or mental health conditions, or reward unsafe behavior. Use an empty adjustments list when there is not enough evidence. ${spiritualityEnabled ? "Spirituality may be assessed only from relevant user-provided information." : "Do not return spirituality adjustments; spirituality tracking is off."} Keep the summary warm, specific, and under 70 words. Set qol_score to a conservative 0–100 reflective wellbeing signal, not a health assessment or diagnosis.`,
        input: `Today's check-in:\n${content}\n\nRecent user context from the past 30 days:\n${wellbeingContext || "No earlier journal entries or check-ins were recorded."}`,
        text: { format: { type: "json_schema", name: "life_stats_check_in", strict: true, schema: analysisSchema } },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!aiResponse.ok) {
      console.error("OpenAI check-in request failed", aiResponse.status);
      return NextResponse.json({ error: "The AI guide is unavailable right now. Please try again shortly." }, { status: 502 });
    }

    const aiBody = await aiResponse.json() as { output_text?: unknown };
    if (typeof aiBody.output_text !== "string") throw new Error("The AI did not return a completed response.");
    const analysis = validateAnalysis(JSON.parse(aiBody.output_text));
    if (!spiritualityEnabled) analysis.adjustments = analysis.adjustments.filter((adjustment) => adjustment.substat_id !== "spirituality");

    const { error } = await supabase.rpc("apply_ai_check_in", {
      p_content: content,
      p_summary: analysis.summary,
      p_adjustments: analysis.adjustments,
      p_qol_score: analysis.qol_score,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Check-in failed", error);
    return NextResponse.json({ error: "Your check-in could not be processed. Please try again." }, { status: 500 });
  }
}
