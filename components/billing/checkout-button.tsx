"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function CheckoutButton() {
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  async function startCheckout() {
    setError(null);
    setIsStarting(true);

    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST" });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to start checkout.");
      }

      window.location.assign(payload.url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start checkout.");
      setIsStarting(false);
    }
  }

  return (
    <div className="checkout-action">
      <Button variant="primary" size="lg" loading={isStarting} onClick={startCheckout}>
        Continue to secure checkout
      </Button>
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    </div>
  );
}
