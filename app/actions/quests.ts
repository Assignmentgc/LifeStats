"use server";

import { revalidatePath } from "next/cache";
import { SUBSTAT_IDS, SUBSTAT_META, type SubstatId } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export type QuestFormState = {
  error?: string;
  success?: string;
};

async function getUserAndClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email_confirmed_at) throw new Error("Please sign in with a verified email.");
  return { supabase, user };
}

function parseQuest(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const substatId = String(formData.get("substat_id") ?? "");
  const rawXp = Number(formData.get("xp_value") ?? 10);
  const isDaily = formData.get("is_daily") === "on";

  if (!title || title.length > 140) {
    throw new Error("Quest titles must be between 1 and 140 characters.");
  }
  if (!SUBSTAT_IDS.includes(substatId as SubstatId)) {
    throw new Error("Choose a valid substat for this quest.");
  }
  if (!Number.isFinite(rawXp) || rawXp < 1 || rawXp > 100) {
    throw new Error("XP must be a number from 1 to 100.");
  }

  const typedSubstatId = substatId as SubstatId;
  return { title, tag: SUBSTAT_META[typedSubstatId].baseStat, substat_id: typedSubstatId, xp_value: Math.round(rawXp), is_daily: isDaily };
}

export async function createQuest(
  _previousState: QuestFormState,
  formData: FormData,
): Promise<QuestFormState> {
  try {
    const { supabase, user } = await getUserAndClient();
    const quest = parseQuest(formData);
    const { error } = await supabase.from("quests").insert({ ...quest, user_id: user.id });
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    revalidatePath("/quests");
    revalidatePath("/habits");
    return { success: "Quest added to your log." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add that quest." };
  }
}

export async function completeQuest(questId: string) {
  try {
    const { supabase } = await getUserAndClient();
    const { error } = await supabase.rpc("complete_quest", { p_quest_id: questId });
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    revalidatePath("/stats");
    revalidatePath("/stats/[category]", "page");
    revalidatePath("/quests");
    revalidatePath("/habits");
    return { success: true } as const;
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not complete that quest.",
    };
  }
}

export async function deleteQuest(questId: string) {
  try {
    const { supabase } = await getUserAndClient();
    const { error } = await supabase.from("quests").delete().eq("id", questId);
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    revalidatePath("/quests");
    revalidatePath("/habits");
    return { success: true } as const;
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not remove that quest.",
    };
  }
}
