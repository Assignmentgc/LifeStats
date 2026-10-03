import { SectionHeading, StatCard } from "@/components/ui";
import { StatsAnalytics } from "@/components/stats/stats-analytics";
import { STAT_META, STAT_NAMES } from "@/lib/constants";
import { getStatsData } from "@/lib/data";

export default async function StatsPage() {
  const { checkInPoints, latestCheckInGains, lifeScore, monthlyProgress } = await getStatsData();

  return (
    <main className="page-container stats-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Character sheet</p>
          <h1 className="page-title">Your stats</h1>
          <p className="page-description">All-time check-in points accumulate without a 100-point cap. Each card shows your latest check-in&apos;s impact. Select a category to see individual scores.</p>
        </div>
      </header>
      <section className="life-score-card" aria-label="LifeScore">
        <div><p className="eyebrow">Weighted overall score</p><h2>LifeScore</h2><p>Calculated from your six Base Stats using your LifeScore weights.</p></div>
        <strong>{lifeScore}<small>/100</small></strong>
      </section>
      <SectionHeading title="Character Stats" />
      <div className="stats-list stats-page__grid">
        {STAT_NAMES.map((name) => {
          return <StatCard key={name} tone={name} value={checkInPoints.categories[name]} latestGain={latestCheckInGains === null ? null : latestCheckInGains?.[name]} description={STAT_META[name].description} />;
        })}
      </div>
      <StatsAnalytics monthlyProgress={monthlyProgress} />
    </main>
  );
}
