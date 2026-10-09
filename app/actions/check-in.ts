"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function refreshCheckInViews() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email_confirmed_at) return { error: "Your check-in was saved, but you need to sign in with a verified email to see updated stats." };

  revalidatePath("/dashboard");
  revalidatePath("/stats");
  revalidatePath("/stats/[category]", "page");
  revalidatePath("/journal");
  return { success: true };
}
