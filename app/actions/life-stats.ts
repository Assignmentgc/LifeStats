"use server";

import { revalidatePath } from "next/cache";
import { CORE_STAT_KEYS, type CoreStatKey } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export type LifeStatActionResult = {
  error?: string;
  success?: string;
};

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  return supabase;
}

function revalidateLifeScores() {
  revalidatePath("/dashboard");
  revalidatePath("/stats");
}

export async function addSubstat(
  coreStat: CoreStatKey,
  rawName: string,
): Promise<LifeStatActionResult> {
  try {
    const name = rawName.trim();
    if (!CORE_STAT_KEYS.includes(coreStat)) {
      throw new Error("Choose one of the six core statistics.");
    }
    if (!name || name.length > 80) {
      throw new Error("Substat names must be between 1 and 80 characters.");
    }

    const supabase = await getAuthenticatedClient();
    const { error } = await supabase.rpc("create_my_substat", {
      p_core_stat: coreStat,
      p_name: name,
    });
    if (error) throw new Error(error.message);

    revalidateLifeScores();
    return { success: "Substat added." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add that substat." };
  }
}

export async function recordSubstatMeasurement(
  substatId: string,
  rawScore: number,
): Promise<LifeStatActionResult> {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(substatId)) {
      throw new Error("Invalid substat.");
    }
    if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 100) {
      throw new Error("Measurements must be a number from 0 to 100.");
    }

    const supabase = await getAuthenticatedClient();
    const { error } = await supabase.rpc("record_my_substat_measurement", {
      p_substat_id: substatId,
      p_score: rawScore,
    });
    if (error) throw new Error(error.message);

    revalidateLifeScores();
    return { success: "Measurement recorded." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record that measurement." };
  }
}
