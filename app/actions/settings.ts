"use server";

import { revalidatePath } from "next/cache";
import type { LifeStatsSettings } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export async function updateLifeStatsSettings(settings: LifeStatsSettings) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  const { error } = await supabase.from("lifestats_settings").upsert({
    user_id: user.id,
    spirituality_enabled: Boolean(settings.spiritualityEnabled),
    include_spirituality_in_life_score: Boolean(settings.spiritualityEnabled && settings.includeSpiritualityInLifeScore),
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard"); revalidatePath("/stats"); revalidatePath("/settings");
  return { success: true };
}
