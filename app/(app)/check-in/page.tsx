import { CheckInForm } from "@/components/check-in/check-in-form";
import { createClient } from "@/lib/supabase/server";

export default async function CheckInPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to view your check-ins.");
  return (
    <main className="page-container check-in-page">
      <header className="check-in-page__header">
        <p className="eyebrow">Daily Check-In</p>
        <h1 className="page-title">Tell me about your day.</h1>
        <p className="page-description">
          Write a few lines about what you did. Real, specific activities earn points.
        </p>
      </header>
      <CheckInForm userId={user.id} />
    </main>
  );
}
