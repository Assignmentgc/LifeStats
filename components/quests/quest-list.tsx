"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { completeQuest, deleteQuest } from "@/app/actions/quests";
import { Button, EmptyState, Panel, StatTag } from "@/components/ui";
import type { Quest } from "@/lib/types";

type QuestListProps = {
  quests: Quest[];
  allowDelete?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function QuestList({
  quests,
  allowDelete = false,
  emptyTitle = "No quests yet",
  emptyDescription = "Add a small, specific quest and turn your next action into XP.",
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
                <StatTag tone={quest.tag} />
                <span className="xp-reward">{pending ? "…" : `+${quest.xp_value} XP`}</span>
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
