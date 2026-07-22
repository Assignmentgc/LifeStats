import Link from "next/link";
import { Plus } from "lucide-react";
import { HabitList } from "@/components/habits/habit-list";
import { getHabitData } from "@/lib/data";

export default async function HabitsPage() {
  const habits = await getHabitData();

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">Habit tracker</p>
          <h1 className="page-title">Keep the chain alive</h1>
          <p className="page-description">Daily quests reset at midnight UTC. Your completion history keeps every streak visible.</p>
        </div>
        <Link className="button button--secondary" href="/quests">
          <Plus aria-hidden="true" size={15} /> Add daily quest
        </Link>
      </header>
      <HabitList habits={habits} />
    </main>
  );
}
