import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (hasSupabaseConfig()) redirect("/");

  return (
    <main className="setup-page">
      <section className="setup-card">
        <p className="eyebrow">One-time setup</p>
        <h1>Connect LifeStats to Supabase</h1>
        <p>
          Create a <code>.env.local</code> file in this project and add your Supabase Project URL and anon key.
        </p>
        <pre aria-label="Required environment variables"><code>{`NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`}</code></pre>
        <ol>
          <li>Copy <code>.env.example</code> to <code>.env.local</code>.</li>
          <li>Get both values from Supabase: Project Settings → API.</li>
          <li>Restart <code>npm run dev</code>, then reload this page.</li>
        </ol>
        <Link className="button button--primary" href="/">Try again</Link>
      </section>
    </main>
  );
}
