"use server";

import { revalidatePath } from "next/cache";
import { STAT_NAMES, type StatName } from "@/lib/constants";
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
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  return { supabase, user };
}

function parseQuest(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const tag = String(formData.get("tag") ?? "");
  const rawXp = Number(formData.get("xp_value") ?? 10);
  const isDaily = formData.get("is_daily") === "on";

  if (!title || title.length > 140) {
    throw new Error("Quest titles must be between 1 and 140 characters.");
  }
  if (!STAT_NAMES.includes(tag as StatName)) {
    throw new Error("Choose a valid stat for this quest.");
  }
  if (!Number.isFinite(rawXp) || rawXp < 1 || rawXp > 100) {
    throw new Error("XP must be a number from 1 to 100.");
  }

  return { title, tag: tag as StatName, xp_value: Math.round(rawXp), is_daily: isDaily };
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
