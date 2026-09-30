import { CoreStatEditor } from "@/components/stats/core-stat-editor";
import { displayScore } from "@/lib/life-stats";
import { getLifeStatsData } from "@/lib/data";

export default async function StatsPage() {
  const lifeStats = await getLifeStatsData();

  return (
    <main className="page-container stats-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Life score model</p>
          <h1 className="page-title">Your life statistics</h1>
          <p className="page-description">Record a 0–100 measurement for a substat. Substats average into a core, and the six cores average into Life.</p>
        </div>
      </header>
      <section className="life-score-card" aria-label={`Life score ${displayScore(lifeStats.lifeScore)} out of 100`}>
        <p>Life</p>
        <strong>{displayScore(lifeStats.lifeScore)}</strong>
        <span>Average of Health, Intellect, Progress, Social, Prosperity, and Purpose.</span>
      </section>
      <div className="core-stat-editor-list">
        {lifeStats.coreStats.map((coreStat) => <CoreStatEditor coreStat={coreStat} key={coreStat.key} />)}
      </div>
    </main>
  );
}
