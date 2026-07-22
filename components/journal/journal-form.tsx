"use client";

import { useActionState, useEffect, useRef } from "react";
import { createJournalEntry, type JournalFormState } from "@/app/actions/journal";
import { Button, Panel } from "@/components/ui";
import { MOODS } from "@/lib/constants";

const initialState: JournalFormState = {};

export function JournalForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(createJournalEntry, initialState);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <Panel>
      <form ref={formRef} action={formAction} className="stack-16">
        <div className="form-heading">
          <div>
            <p className="eyebrow">Field notes</p>
            <h2>Record today</h2>
          </div>
          <span className="form-heading__hint">A few honest lines count.</span>
        </div>
        <label className="field">
          <span className="field__label">Entry</span>
          <textarea
            className="textarea"
            maxLength={5000}
            name="content"
            placeholder="What happened? What did you notice?"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Mood (optional)</span>
          <select className="select" defaultValue="" name="mood">
            <option value="">No mood selected</option>
            {MOODS.map((mood) => (
              <option key={mood.value} value={mood.value}>{mood.emoji} {mood.label}</option>
            ))}
          </select>
        </label>
        {state.error ? <p className="form-message form-message--error">{state.error}</p> : null}
        {state.success ? <p className="form-message form-message--success">{state.success}</p> : null}
        <Button loading={isPending} type="submit" variant="primary">Save entry</Button>
      </form>
    </Panel>
  );
}
