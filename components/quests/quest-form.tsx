"use client";

import { useActionState, useEffect, useRef } from "react";
import { createQuest, type QuestFormState } from "@/app/actions/quests";
import { Button, Panel } from "@/components/ui";
import { STAT_META, STAT_NAMES } from "@/lib/constants";

const initialState: QuestFormState = {};

export function QuestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(createQuest, initialState);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <Panel className="quest-form-panel">
      <form ref={formRef} action={formAction} className="stack-16">
        <div className="form-heading">
          <div>
            <p className="eyebrow">New objective</p>
            <h2>Add a quest</h2>
          </div>
          <span className="form-heading__hint">Make it concrete and finishable.</span>
        </div>
        <label className="field">
          <span className="field__label">Quest title</span>
          <input
            className="input"
            name="title"
            maxLength={140}
            placeholder="e.g. Walk outside for 20 minutes"
            required
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Stat</span>
            <select className="select" defaultValue="vitality" name="tag">
              {STAT_NAMES.map((name) => (
                <option key={name} value={name}>{STAT_META[name].label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">XP reward</span>
            <input className="input" defaultValue="10" max="100" min="1" name="xp_value" type="number" required />
          </label>
        </div>
        <label className="daily-toggle">
          <input name="is_daily" type="checkbox" />
          <span>
            <strong>Repeat daily</strong>
            <small>It resets each new UTC day and earns a habit streak.</small>
          </span>
        </label>
        {state.error ? <p className="form-message form-message--error">{state.error}</p> : null}
        {state.success ? <p className="form-message form-message--success">{state.success}</p> : null}
        <Button loading={isPending} type="submit" variant="primary">Add quest</Button>
      </form>
    </Panel>
  );
}
