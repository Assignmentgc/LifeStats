import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <div>
            <p className="eyebrow">Begin your character sheet</p>
            <h1 className="brand-name">LifeStats</h1>
          </div>
        </div>
        <div className="auth-intro">
          <h2>Start your campaign</h2>
          <p>Your first four stats are ready. You decide what progress looks like.</p>
        </div>
        <AuthForm mode="signup" />
        <p className="auth-switch">
          Already a member? <Link href="/login">Log in</Link>
        </p>
      </section>
    </main>
  );
}
