import { NextResponse } from "next/server";
import { DEFAULT_LIFESTATS_SETTINGS } from "@/lib/constants";
import { CheckInError, dayInTimezone, isRecord, isUuid, parseCheckInRequest, validateAnalysis } from "@/lib/check-in/analysis";
import { analyzeWithPerplexity, type CompactContext } from "@/lib/check-in/perplexity";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPrivilegedSupabaseKey } from "@/lib/supabase/credentials";
import { createClient } from "@/lib/supabase/server";
import { getFullName } from "@/lib/user-name";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("session_id");
    if (sessionId !== null && !isUuid(sessionId)) return NextResponse.json({ error: "Invalid check-in session." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in to view check-ins." }, { status: 401 });
    let query = supabase.from("ai_check_ins").select("id, session_id").eq("user_id", user.id).not("session_id", "is", null);
    if (sessionId) query = query.eq("session_id", sessionId);
    const { data: entry, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return NextResponse.json({ error: "Check-in history needs the evidence database migration." }, { status: 503 });
    if (!entry) return NextResponse.json({ entry_id: null });
    const { data, error: resultError } = await createAdminClient().rpc("get_check_in_result", { p_user_id: user.id, p_entry_id: entry.id });
    if (resultError) throw new Error("Could not restore check-in session.");
    const { data: turns, error: turnsError } = await supabase.from("ai_check_ins")
      .select("id, content, analysis, created_at").eq("user_id", user.id).eq("session_id", entry.session_id)
      .not("analysis", "is", null).order("created_at", { ascending: true }).limit(50);
    if (turnsError) throw new Error("Could not restore check-in history.");
    return NextResponse.json({ ...data, session_id: entry.session_id, turns: turns ?? [] });
  } catch {
    console.error("Check-in history failed");
    return NextResponse.json({ error: "Could not restore your check-in session. Please try again." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const receivedAt = new Date();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new CheckInError("Send a valid JSON check-in.", 400, "invalid_json_input");
    }
    const input = parseCheckInRequest(body);
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new CheckInError("Please sign in to submit a check-in.", 401, "unauthenticated");
    if (!isPrivilegedSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      throw new CheckInError("Check-in storage requires a server-only Supabase secret key or service_role key. The publishable browser key cannot save entries; ask the administrator to update SUPABASE_SERVICE_ROLE_KEY.", 503, "invalid_server_credential");
    }
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (process.env.PERPLEXITY_CHECK_INS_ENABLED !== "true" || !apiKey || apiKey.includes("replace-me") || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes("replace-me")) {
      throw new CheckInError("AI check-ins need server configuration before entries can be saved.", 503, "not_configured");
    }
    const admin = createAdminClient();
    const { data: existing, error: existingError } = await supabase.from("ai_check_ins")
      .select("id, content, session_id").eq("request_id", input.requestId).maybeSingle();
    if (existingError) throw new CheckInError("Check-in storage is unavailable. Please check the database migrations.", 503, "storage_unavailable");
    if (existing) {
      const { data: session, error: sessionError } = await supabase.from("check_in_sessions").select("timezone").eq("id", input.sessionId).maybeSingle();
      if (sessionError) throw new Error("Could not load check-in session.");
      if (existing.content !== input.content || existing.session_id !== input.sessionId || session?.timezone !== input.timezone) {
        throw new CheckInError("This request was already used for a different entry. Reload before submitting.", 409, "request_conflict");
      }
      const { data, error } = await admin.rpc("get_check_in_result", { p_user_id: user.id, p_entry_id: existing.id });
      if (error) throw new Error("Could not load the saved check-in.");
      return NextResponse.json(data);
    }
    const [settingsResult, entriesResult, evidenceResult, questsResult] = await Promise.all([
      supabase.from("lifestats_settings").select("spirituality_enabled, check_in_timezone").maybeSingle(),
      supabase.from("ai_check_ins").select("analysis").eq("session_id", input.sessionId).order("created_at", { ascending: false }).limit(3),
      supabase.from("check_in_evidence").select("substat_id, activity_key, observation, direction, local_day").gte("created_at", new Date(receivedAt.getTime() - 48 * 60 * 60 * 1000).toISOString()).order("created_at", { ascending: false }).limit(72),
      supabase.from("quests").select("id, title, substat_id, completed_at").eq("is_completed", true).gte("completed_at", new Date(receivedAt.getTime() - 48 * 60 * 60 * 1000).toISOString()).limit(30),
    ]);
    if (settingsResult.error || entriesResult.error || evidenceResult.error || questsResult.error) {
      throw new CheckInError("Could not load check-in context. Please check the database migrations.", 503, "context_unavailable");
    }
    if (settingsResult.data?.check_in_timezone && settingsResult.data.check_in_timezone !== input.timezone) {
      throw new CheckInError(`Check-ins use your saved timezone (${settingsResult.data.check_in_timezone}). Your device timezone must match for now.`, 409, "timezone_conflict");
    }
    const localDay = dayInTimezone(receivedAt, input.timezone);
    const spiritualityEnabled = settingsResult.data?.spirituality_enabled ?? DEFAULT_LIFESTATS_SETTINGS.spiritualityEnabled;
    const completedQuests = (questsResult.data ?? []).filter((quest) => typeof quest.completed_at === "string" && dayInTimezone(new Date(quest.completed_at), input.timezone) === localDay);
    const context: CompactContext = {
      user_full_name: getFullName(user),
      spirituality_enabled: spiritualityEnabled,
      prior_entries: (entriesResult.data ?? []).flatMap(({ analysis }) => isRecord(analysis) && typeof analysis.acknowledgement === "string" ? [{
        acknowledgement: analysis.acknowledgement,
        follow_up_question: typeof analysis.follow_up_question === "string" ? analysis.follow_up_question : null,
      }] : []),
      today_evidence: (evidenceResult.data ?? []).filter((entry) => entry.local_day === localDay),
      completed_quests: completedQuests,
    };
    const model = process.env.PERPLEXITY_MODEL || "google/gemini-3.1-flash-lite";
    const rawAnalysis = await analyzeWithPerplexity(input.content, context, apiKey, model);
    const analysis = validateAnalysis(rawAnalysis, input.content, spiritualityEnabled, new Set(completedQuests.map((quest) => quest.id)));
    const { data, error } = await admin.rpc("save_check_in_evidence", {
      p_user_id: user.id,
      p_session_id: input.sessionId,
      p_request_id: input.requestId,
      p_content: input.content,
      p_timezone: input.timezone,
      p_received_at: receivedAt.toISOString(),
      p_analysis: analysis,
      p_model: model,
    });
    if (error) {
      console.error("Check-in persistence failed", { code: error.code });
      if (error.code === "42501") throw new CheckInError("Check-in storage permissions are not configured. Verify the server-only Supabase credential and database function grants.", 503, "storage_permission_denied");
      if (error.code === "23505" || error.code === "22023") throw new CheckInError("The session or timezone changed. Reload before submitting again.", 409, "session_conflict");
      throw new CheckInError("Your entry could not be saved. Your text is still here; please retry.", 503, "save_failed");
    }
    return NextResponse.json(data);
  } catch (error) {
    // Never log journal text, provider bodies, or credential-bearing errors.
    const known = error instanceof CheckInError;
    console.error("Check-in failed", { code: known ? error.code : "unexpected_error" });
    return NextResponse.json({ error: known ? error.message : "Your check-in could not be processed. Your text is still here; please retry." }, { status: known ? error.status : 500 });
  }
}
