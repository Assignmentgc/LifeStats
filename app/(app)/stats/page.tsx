import { SectionHeading, StatCard } from "@/components/ui";
import { StatsAnalytics } from "@/components/stats/stats-analytics";
import { getActiveSubstats, getLifeScoreWeights, STAT_META, STAT_NAMES, SUBSTAT_META } from "@/lib/constants";
import { getStatsData } from "@/lib/data";

export default async function StatsPage() {
  const { stats, substats, settings, lifeScore, monthlyProgress, qolTrend } = await getStatsData();
  const weights = getLifeScoreWeights(settings);

  return (
    <main className="page-container stats-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Character sheet</p>
          <h1 className="page-title">Your stats</h1>
          <p className="page-description">Your check-ins shape the character you are becoming.</p>
        </div>
      </header>
      <section className="life-score-card" aria-label="LifeScore">
        <div><p className="eyebrow">Weighted overall score</p><h2>LifeScore</h2><p>Calculated from your six Base Stats using your LifeScore weights.</p></div>
        <strong>{lifeScore}<small>/100</small></strong>
      </section>
      <SectionHeading title="Character Stats" />
      <div className="stats-list stats-page__grid">
        {STAT_NAMES.map((name) => {
          const stat = stats.find((item) => item.stat_name === name);
          const activeSubstats = getActiveSubstats(name, settings);
          return <StatCard key={name} tone={name} value={stat?.value ?? 0} description={STAT_META[name].description} footer={<><span className="stat-card__weight">{Math.round(weights[name] * 100)}% of LifeScore</span><div className="substat-list">{activeSubstats.map((substatId) => <span key={substatId}>{SUBSTAT_META[substatId].label} <b>{substats.find((item) => item.substat_id === substatId)?.value ?? 0}</b></span>)}</div></>} />;
        })}
      </div>
      <StatsAnalytics monthlyProgress={monthlyProgress} qolTrend={qolTrend} />
    </main>
  );
}
