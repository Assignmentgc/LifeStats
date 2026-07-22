import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { message } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <div>
            <p className="eyebrow">Character progression system</p>
            <h1 className="brand-name">LifeStats</h1>
          </div>
        </div>
        <div className="auth-intro">
          <h2>Enter the guild</h2>
          <p>Turn the things that matter into quests, XP, and visible momentum.</p>
        </div>
        {message ? <p className="form-message form-message--error">{message}</p> : null}
        <AuthForm mode="login" />
        <p className="auth-switch">
          New adventurer? <Link href="/sign-up">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
