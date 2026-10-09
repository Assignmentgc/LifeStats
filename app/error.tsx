"use client";

import { useEffect } from "react";
import { BrandMark } from "@/components/brand-mark";
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
        <BrandMark className="status-mark" />
        <p className="eyebrow">Unexpected encounter</p>
        <h1>LifeStats hit a snag.</h1>
        <p>We couldn&apos;t load this page. Please try again. If the problem continues, share the reference below with support.</p>
        {error.digest ? <p className="error-reference">Reference: <code>{error.digest}</code></p> : null}
        <Button variant="primary" onClick={reset}>Try again</Button>
      </Panel>
    </main>
  );
}
