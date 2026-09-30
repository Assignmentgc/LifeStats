"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addSubstat, recordSubstatMeasurement } from "@/app/actions/life-stats";
import { CORE_STAT_META } from "@/lib/constants";
import { displayScore } from "@/lib/life-stats";
import type { CoreStat } from "@/lib/types";

type CoreStatEditorProps = {
  coreStat: CoreStat;
};

export function CoreStatEditor({ coreStat }: CoreStatEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newSubstat, setNewSubstat] = useState("");
  const [measurementInputs, setMeasurementInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const meta = CORE_STAT_META[coreStat.key];

  function submitMeasurement(event: React.FormEvent<HTMLFormElement>, substatId: string) {
    event.preventDefault();
    const rawScore = Number(measurementInputs[substatId]);
    setMessage(null);
    startTransition(async () => {
      const result = await recordSubstatMeasurement(substatId, rawScore);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMeasurementInputs((current) => ({ ...current, [substatId]: "" }));
      setMessage(result.success ?? null);
      router.refresh();
    });
  }

  function submitSubstat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await addSubstat(coreStat.key, newSubstat);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setNewSubstat("");
      setMessage(result.success ?? null);
      router.refresh();
    });
  }

  return (
    <section className="core-stat-editor" data-tone={coreStat.key}>
      <header className="core-stat-editor__header">
        <div>
          <p className="eyebrow">Core statistic</p>
          <h2>{meta.label}</h2>
          <p>{meta.description}</p>
        </div>
        <div className="core-stat-editor__score" aria-label={`${meta.label} score ${displayScore(coreStat.score)} out of 100`}>
          <strong>{displayScore(coreStat.score)}</strong>
          <span> / 100</span>
        </div>
      </header>

      <p className="core-stat-editor__formula">
        Average of {coreStat.substats.length} substat{coreStat.substats.length === 1 ? "" : "s"}
      </p>

      <div className="substat-list">
        {coreStat.substats.map((substat) => (
          <article className="substat-row" key={substat.id}>
            <div>
              <h3>{substat.name}</h3>
              <p>{substat.measurement_count} measurement{substat.measurement_count === 1 ? "" : "s"}</p>
            </div>
            <strong className="substat-row__score">{displayScore(substat.score)}</strong>
            <form className="substat-row__form" onSubmit={(event) => submitMeasurement(event, substat.id)}>
              <label className="sr-only" htmlFor={`measurement-${substat.id}`}>Record a 0 to 100 measurement for {substat.name}</label>
              <input
                className="input"
                id={`measurement-${substat.id}`}
                max="100"
                min="0"
                onChange={(event) => setMeasurementInputs((current) => ({ ...current, [substat.id]: event.target.value }))}
                placeholder="0–100"
                required
                step="1"
                type="number"
                value={measurementInputs[substat.id] ?? ""}
              />
              <button className="button button--secondary" disabled={isPending} type="submit">Record</button>
            </form>
          </article>
        ))}
      </div>

      <form className="add-substat-form" onSubmit={submitSubstat}>
        <label className="sr-only" htmlFor={`new-${coreStat.key}`}>New {meta.label} substat</label>
        <input
          className="input"
          id={`new-${coreStat.key}`}
          maxLength={80}
          onChange={(event) => setNewSubstat(event.target.value)}
          placeholder={`Add a ${meta.label.toLowerCase()} substat`}
          required
          value={newSubstat}
        />
        <button className="button button--ghost" disabled={isPending} type="submit">
          <Plus aria-hidden="true" size={15} /> Add substat
        </button>
      </form>
      {message ? <p className="core-stat-editor__message" role="status">{message}</p> : null}
    </section>
  );
}
