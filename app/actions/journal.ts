"use server";

import { revalidatePath } from "next/cache";
import { MOODS, type Mood } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export type JournalFormState = {
  error?: string;
  success?: string;
};

export async function createJournalEntry(
  _previousState: JournalFormState,
  formData: FormData,
): Promise<JournalFormState> {
  try {
    const content = String(formData.get("content") ?? "").trim();
    const rawMood = String(formData.get("mood") ?? "");
    const mood = rawMood || null;

    if (!content || content.length > 5000) {
      throw new Error("Journal entries must be between 1 and 5,000 characters.");
    }
    if (mood && !MOODS.some((item) => item.value === mood)) {
      throw new Error("Choose a valid mood, or leave it blank.");
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");

    const { error } = await supabase.from("journal_entries").insert({
      user_id: user.id,
      content,
      mood: mood as Mood | null,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/journal");
    return { success: "Journal entry saved." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save your journal entry.",
    };
  }
}
