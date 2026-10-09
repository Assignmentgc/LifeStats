"use server";

import { revalidatePath } from "next/cache";
import { isTodoCategory } from "@/lib/todos";
import { createClient } from "@/lib/supabase/server";

export type TodoFormState = { error?: string; success?: string };

async function getUserAndClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email_confirmed_at) throw new Error("Please sign in with a verified email.");
  return { supabase, user };
}

function refreshTodoViews() {
  revalidatePath("/dashboard");
  revalidatePath("/todo");
}

export async function createTodo(_previousState: TodoFormState, formData: FormData): Promise<TodoFormState> {
  try {
    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "");
    if (!title || title.length > 240) throw new Error("Tasks must be between 1 and 240 characters.");
    if (!isTodoCategory(category)) throw new Error("Choose a valid category.");

    const { supabase, user } = await getUserAndClient();
    const { error } = await supabase.from("todos").insert({ user_id: user.id, title, category });
    if (error) throw new Error(error.message);
    refreshTodoViews();
    return { success: "Task added." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add that task." };
  }
}

export async function setTodoCompleted(todoId: string, completed: boolean) {
  try {
    const { supabase } = await getUserAndClient();
    const { error } = await supabase.from("todos").update({ is_completed: completed, completed_at: completed ? new Date().toISOString() : null }).eq("id", todoId);
    if (error) throw new Error(error.message);
    refreshTodoViews();
    return { success: true } as const;
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Could not update that task." };
  }
}

export async function deleteTodo(todoId: string) {
  try {
    const { supabase } = await getUserAndClient();
    const { error } = await supabase.from("todos").delete().eq("id", todoId);
    if (error) throw new Error(error.message);
    refreshTodoViews();
    return { success: true } as const;
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Could not remove that task." };
  }
}
