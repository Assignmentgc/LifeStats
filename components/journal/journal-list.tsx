import { EmptyState, Panel } from "@/components/ui";
import { MOODS } from "@/lib/constants";
import type { JournalEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function JournalList({ entries }: { entries: JournalEntry[] }) {
  if (!entries.length) {
    return (
      <EmptyState
        title="Your journal is waiting"
        description="Write the first field note when you are ready."
      />
    );
  }

  return (
    <div className="journal-list">
      {entries.map((entry) => {
        const mood = MOODS.find((item) => item.value === entry.mood);
        return (
          <Panel className="journal-entry" key={`${entry.source ?? "journal"}:${entry.id}`}>
            <div className="journal-entry__meta">
              <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
              {entry.source === "check-in" ? <span className="mood-tag">Daily check-in</span> : null}
              {mood ? <span className="mood-tag">{mood.emoji} {mood.label}</span> : null}
            </div>
            <p>{entry.content}</p>
          </Panel>
        );
      })}
    </div>
  );
}
