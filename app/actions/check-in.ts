"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function refreshCheckInViews() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your check-in was saved, but your session expired. Sign in again to see updated stats." };

  revalidatePath("/dashboard");
  revalidatePath("/stats");
  revalidatePath("/stats/[category]", "page");
  revalidatePath("/journal");
  return { success: true };
}
