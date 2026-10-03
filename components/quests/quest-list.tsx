"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { completeQuest, deleteQuest } from "@/app/actions/quests";
import { Button, EmptyState, Panel, StatTag } from "@/components/ui";
import type { Quest } from "@/lib/types";
import { SUBSTAT_META } from "@/lib/constants";

type QuestListProps = {
  quests: Quest[];
  allowDelete?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  variant?: "standard" | "daily";
};

export function QuestList({
  quests,
  allowDelete = false,
  emptyTitle = "No quests yet",
  emptyDescription = "Add a small, specific quest to build your stats. Daily habits also earn XP.",
  variant = "standard",
}: QuestListProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function markComplete(questId: string) {
    setError(null);
    setPendingId(questId);
    startTransition(async () => {
      const result = await completeQuest(questId);
      if (!result.success) setError(result.error);
      setPendingId(null);
    });
  }

  function removeQuest(questId: string) {
    setError(null);
    setPendingId(questId);
    startTransition(async () => {
      const result = await deleteQuest(questId);
      if (!result.success) setError(result.error);
      setPendingId(null);
    });
  }

  if (!quests.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="stack-8">
      {error ? <p className="form-message form-message--error">{error}</p> : null}
      <Panel className="quest-list" padded={false}>
        {quests.map((quest) => {
          const pending = isPending && pendingId === quest.id;
          if (variant === "daily") {
            return (
              <button
                aria-label={quest.is_completed ? `${quest.title} completed` : `Complete ${quest.title}`}
                className={`quest-item quest-item--daily ${quest.is_completed ? "quest-item--complete" : ""}`}
                disabled={quest.is_completed || pending}
                key={quest.id}
                onClick={() => markComplete(quest.id)}
                type="button"
              >
                <span className="quest-item__xp-chip">{quest.is_daily ? `+${quest.xp_value}` : "Stats"}</span>
                <span className="quest-item__title">{quest.title}</span>
                <ChevronRight aria-hidden="true" className="quest-item__chevron" size={18} />
              </button>
            );
          }

          return (
            <div
              className={`quest-item ${quest.is_completed ? "quest-item--complete" : ""}`}
              key={quest.id}
            >
              <input
                className="quest-item__checkbox"
                aria-label={quest.is_completed ? `${quest.title} completed` : `Complete ${quest.title}`}
                type="checkbox"
                checked={quest.is_completed}
                disabled={quest.is_completed || pending}
                onChange={() => markComplete(quest.id)}
              />
              <div>
                <div className="quest-item__title">{quest.title}</div>
                <div className="quest-item__subline">
                  {quest.is_daily ? "Daily habit" : "One-time quest"}
                  {quest.is_completed ? " · Completed" : ""}
                </div>
              </div>
              <div className="quest-item__meta">
                <StatTag tone={quest.tag}>{quest.substat_id ? SUBSTAT_META[quest.substat_id].label : undefined}</StatTag>
                <span className="xp-reward">{pending ? "…" : quest.is_daily ? `+${quest.xp_value} XP` : "Stat progress only"}</span>
                {allowDelete ? (
                  <Button
                    aria-label={`Delete ${quest.title}`}
                    disabled={pending}
                    onClick={() => removeQuest(quest.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
