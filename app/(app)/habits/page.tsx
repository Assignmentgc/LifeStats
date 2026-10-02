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
          <p className="page-description">Your existing habit streaks remain here while daily progress is now captured through check-ins.</p>
        </div>
      </header>
      <HabitList habits={habits} />
    </main>
  );
}
