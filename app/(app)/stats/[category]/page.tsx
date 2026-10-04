import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, SectionHeading } from "@/components/ui";
import { CategoryTrend } from "@/components/stats/category-trend";
import { STAT_META, STAT_NAMES, SUBSTAT_META } from "@/lib/constants";
import { getCategoryTrend, getStatsData } from "@/lib/data";
import { formatNumber } from "@/lib/utils";

export default async function CategoryStatsPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const stat = STAT_NAMES.find((name) => name === category);
  if (!stat) notFound();
  const [{ substats, checkInPoints }, trend] = await Promise.all([getStatsData(), getCategoryTrend(stat)]);

  return (
    <main className="page-container">
      <header className="page-header">
        <Link className="section-link" href="/stats">Back to all stats</Link>
        <h1 className="page-title">{STAT_META[stat].label}</h1>
        <p className="page-description">{formatNumber(checkInPoints.categories[stat])} cumulative check-in points. Individual scores below include saved habit and quest progress, capped at 100. Check-in points track lifetime applied gains separately.</p>
      </header>
      <CategoryTrend points={trend.points} gained={trend.gained} total={trend.total} color={STAT_META[stat].color} days={trend.points.length} />
      <SectionHeading title="Individual scores" />
      <div className="substat-detail-list">
        {STAT_META[stat].substats.map((id) => (
          <Panel key={id}>
            <h2>{SUBSTAT_META[id].label}</h2>
            <p><strong>{formatNumber(substats.find((score) => score.substat_id === id)?.value ?? 0)}</strong> /100 current score</p>
            <p className="check-in-result__quiet">{formatNumber(checkInPoints.substats[id] ?? 0)} cumulative check-in points</p>
          </Panel>
        ))}
      </div>
    </main>
  );
}
