import { SectionHeading, StatCard } from "@/components/ui";
import { STAT_NAMES } from "@/lib/constants";
import { getQuestData } from "@/lib/data";

export default async function StatsPage() {
  const { stats } = await getQuestData();

  return (
    <main className="page-container stats-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Character sheet</p>
          <h1 className="page-title">Your stats</h1>
          <p className="page-description">Each completed quest makes one part of your character stronger.</p>
        </div>
      </header>
      <SectionHeading title="Character Stats" />
      <div className="stats-list stats-page__grid">
        {STAT_NAMES.map((name) => {
          const stat = stats.find((item) => item.stat_name === name);
          return <StatCard key={name} tone={name} value={stat?.value ?? 0} />;
        })}
      </div>
    </main>
  );
}
