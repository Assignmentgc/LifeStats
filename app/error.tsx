"use client";

import { useEffect } from "react";
import { Button, Panel } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-page">
      <Panel className="error-card">
        <p className="eyebrow">Unexpected encounter</p>
        <h1>LifeStats hit a snag.</h1>
        <p>Check that the Supabase migration and environment variables are configured, then try again.</p>
        <Button variant="primary" onClick={reset}>Try again</Button>
      </Panel>
    </main>
  );
}
