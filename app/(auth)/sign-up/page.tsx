import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { BrandMark } from "@/components/brand-mark";
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
          <span className="brand-lockup__mark" aria-hidden="true"><BrandMark /></span>
          <div>
            <p className="eyebrow">Begin your character sheet</p>
            <h1 className="brand-name">LifeStats</h1>
          </div>
        </div>
        <div className="auth-intro">
          <h2>Start your campaign</h2>
          <p>Your six core stats are ready. You decide what progress looks like.</p>
        </div>
        <AuthForm mode="signup" />
        <p className="auth-switch">
          Already a member? <Link href="/login">Log in</Link>
        </p>
      </section>
    </main>
  );
}
