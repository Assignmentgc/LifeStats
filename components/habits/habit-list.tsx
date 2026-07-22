"use client";

import { useState, useTransition } from "react";
import { Check, Flame } from "lucide-react";
import { completeQuest } from "@/app/actions/quests";
import { Button, EmptyState, Panel, ProgressBar, StatTag } from "@/components/ui";
import type { Habit } from "@/lib/types";

export function HabitList({ habits }: { habits: Habit[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function completeHabit(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await completeQuest(id);
      if (!result.success) setError(result.error);
      setPendingId(null);
    });
  }

  if (!habits.length) {
    return (
      <EmptyState
        title="No daily habits yet"
        description="Create a quest and mark it “Repeat daily” to start a streak."
      />
    );
  }

  return (
    <div className="stack-12">
      {error ? <p className="form-message form-message--error">{error}</p> : null}
      {habits.map((habit) => {
        const pending = isPending && pendingId === habit.id;
        const streakFill = Math.min(100, habit.streak * 10);
        return (
          <Panel className="habit-card" key={habit.id} tone={habit.tag}>
            <div className="habit-card__topline">
              <div>
                <div className="habit-card__title-row">
                  <h2>{habit.title}</h2>
                  <StatTag tone={habit.tag} />
                </div>
                <p>{habit.xp_value} XP every day</p>
              </div>
              <div className="streak-count" aria-label={`${habit.streak} day streak`}>
                <Flame aria-hidden="true" size={18} />
                <strong>{habit.streak}</strong>
                <span>day streak</span>
              </div>
            </div>
            <ProgressBar
              label="Streak charge"
              showValue
              size="sm"
              tone={habit.tag}
              value={streakFill}
              valueLabel={`${habit.streak} days`}
            />
            <div className="habit-card__footer">
              {habit.completedToday ? (
                <span className="habit-complete"><Check aria-hidden="true" size={15} /> Completed for today</span>
              ) : (
                <span>Complete it today to protect your streak.</span>
              )}
              <Button
                disabled={habit.completedToday || pending}
                loading={pending}
                onClick={() => completeHabit(habit.id)}
                size="sm"
                variant={habit.completedToday ? "ghost" : "primary"}
              >
                {habit.completedToday ? "Done" : "Complete"}
              </Button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
