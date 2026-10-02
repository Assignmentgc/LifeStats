"use client";

import { Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Panel, StatTag } from "@/components/ui";
import { SUBSTAT_META, type SubstatId } from "@/lib/constants";

type Adjustment = {
  substat_id: SubstatId;
  change: number;
  reason: string;
};

type CheckInResponse = {
  summary?: string;
  adjustments?: Adjustment[];
  error?: string;
};

export function CheckInForm() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = (await response.json()) as CheckInResponse;
      if (!response.ok) throw new Error(payload.error ?? "Your check-in could not be processed.");

      setResult(payload);
      setContent("");
      router.refresh();
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Your check-in could not be processed." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="check-in-layout">
      <Panel className="check-in-guide" inset>
        <div className="check-in-guide__icon" aria-hidden="true"><Sparkles size={18} /></div>
        <div>
          <h2>Hey! I&apos;m here to notice your progress.</h2>
          <p>Describe what happened today in as much detail as you like — movement, focus, connection, routines, wins, and hard moments all count.</p>
        </div>
      </Panel>

      <form className="check-in-form" onSubmit={submitCheckIn}>
        <label className="field" htmlFor="check-in-content">
          <span className="field__label">Your day</span>
          <textarea
            className="textarea check-in-form__textarea"
            id="check-in-content"
            maxLength={5000}
            onChange={(event) => setContent(event.target.value)}
            placeholder="I went for a run before work, finished a difficult project, and called my sister..."
            value={content}
          />
        </label>
        <div className="check-in-form__footer">
          <span>{content.length}/5,000</span>
          <Button disabled={!content.trim()} loading={isSubmitting} type="submit" variant="primary">
            <Send aria-hidden="true" size={15} /> Analyze check-in
          </Button>
        </div>
      </form>

      {result?.error ? <p className="form-message form-message--error">{result.error}</p> : null}
      {result?.summary ? (
        <Panel className="check-in-result">
          <p className="eyebrow">Check-in complete</p>
          <h2>{result.summary}</h2>
          {result.adjustments?.length ? (
            <div className="check-in-adjustments">
              {result.adjustments.map((adjustment) => (
                <div className="check-in-adjustment" key={adjustment.substat_id}>
                  <StatTag tone={SUBSTAT_META[adjustment.substat_id].baseStat} />
                  <strong className={adjustment.change > 0 ? "check-in-adjustment__positive" : "check-in-adjustment__negative"}>
                    {adjustment.change > 0 ? "+" : ""}{adjustment.change}
                  </strong>
                  <span>{SUBSTAT_META[adjustment.substat_id].label}: {adjustment.reason}</span>
                </div>
              ))}
            </div>
          ) : <p className="check-in-result__quiet">No stat change this time — reflection is still progress.</p>}
        </Panel>
      ) : null}
    </div>
  );
}
