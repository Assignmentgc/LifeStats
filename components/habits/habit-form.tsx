"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { createQuest, type QuestFormState } from "@/app/actions/quests";
import { Button } from "@/components/ui";
import { STAT_NAMES, SUBSTAT_META, getActiveSubstats } from "@/lib/constants";

const initialState: QuestFormState = {};

export function HabitForm() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(createQuest, initialState);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    dialogRef.current?.close();
  }, [state.success]);

  return (
    <>
      <Button onClick={() => dialogRef.current?.showModal()} type="button" variant="primary">
        <Plus aria-hidden="true" size={16} /> New habit
      </Button>
      <dialog aria-labelledby="new-habit-title" className="habit-dialog" ref={dialogRef}>
        <form ref={formRef} action={formAction} className="habit-dialog__form">
          <input name="is_daily" type="hidden" value="on" />
          <input name="xp_value" type="hidden" value="10" />
          <div className="habit-dialog__heading">
            <div>
              <p className="eyebrow">Daily habit</p>
              <h2 id="new-habit-title">Add a habit</h2>
              <p>Create an action you want to repeat every day.</p>
            </div>
            <Button aria-label="Close add habit dialog" onClick={() => dialogRef.current?.close()} size="sm" type="button" variant="ghost">
              <X aria-hidden="true" size={18} />
            </Button>
          </div>
          <label className="field">
            <span className="field__label">Habit title</span>
            <input
              autoFocus
              className="input"
              maxLength={140}
              name="title"
              placeholder="e.g. Walk outside for 20 minutes"
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Substat</span>
            <select className="select" defaultValue="fitness" name="substat_id">
              {STAT_NAMES.flatMap((name) => getActiveSubstats(name).map((substatId) => (
                <option key={substatId} value={substatId}>{`${SUBSTAT_META[substatId].label} — ${name[0].toUpperCase()}${name.slice(1)}`}</option>
              )))}
            </select>
          </label>
          <p className="habit-dialog__xp">Daily habits award <strong>10 XP</strong> when completed.</p>
          {state.error ? <p className="form-message form-message--error">{state.error}</p> : null}
          <div className="habit-dialog__actions">
            <Button onClick={() => dialogRef.current?.close()} type="button" variant="ghost">Cancel</Button>
            <Button loading={isPending} loadingText="Adding…" type="submit" variant="primary">Add habit</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
