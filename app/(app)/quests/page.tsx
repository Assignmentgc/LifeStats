import { QuestForm } from "@/components/quests/quest-form";
import { QuestList } from "@/components/quests/quest-list";
import { SectionHeading } from "@/components/ui";
import { getQuestData } from "@/lib/data";

export default async function QuestPage() {
  const { quests } = await getQuestData();

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <p className="eyebrow">Quest log</p>
          <h1 className="page-title">Choose your next move</h1>
          <p className="page-description">Every completed quest banks XP and strengthens one part of your character sheet.</p>
        </div>
      </header>
      <div className="two-column-grid quest-page-grid">
        <QuestForm />
        <section>
          <SectionHeading
            title="Your quests"
            description={`${quests.filter((quest) => !quest.is_completed).length} active objective${quests.filter((quest) => !quest.is_completed).length === 1 ? "" : "s"}`}
          />
          <QuestList allowDelete quests={quests} />
        </section>
      </div>
    </main>
  );
}
