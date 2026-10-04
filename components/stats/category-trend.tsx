import { ChartNoAxesCombined } from "lucide-react";
import { Panel } from "@/components/ui";
import type { TrendPoint } from "@/lib/scoring";
import { formatNumber } from "@/lib/utils";

const width = 600;
const height = 160;
const padding = { top: 12, right: 8, bottom: 8, left: 8 };

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function CategoryTrend({ points, gained, total, color, days }: { points: TrendPoint[]; gained: number; total: number; color: string; days: number }) {
  const min = points[0]?.value ?? 0;
  const max = Math.max(...points.map((point) => point.value), min + 1);
  const x = (index: number) => padding.left + ((width - padding.left - padding.right) * index) / Math.max(points.length - 1, 1);
  const y = (value: number) => padding.top + (height - padding.top - padding.bottom) * (1 - (value - min) / (max - min));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`).join(" ");

  return (
    <Panel className="category-trend">
      <div className="category-trend__header">
        <div>
          <h2>Trend</h2>
          <p className="check-in-result__quiet">Cumulative check-in points, last {days} days</p>
        </div>
        <strong style={{ color }}>+{formatNumber(gained)}<small> in {days} days</small></strong>
      </div>
      {gained > 0 ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
            aria-label={`Check-in points rose by ${formatNumber(gained)} over the last ${days} days, to ${formatNumber(total)} in total.`}>
            {[0.25, 0.5, 0.75].map((fraction) => {
              const line = padding.top + (height - padding.top - padding.bottom) * fraction;
              return <line className="category-trend__grid" key={fraction} x1="0" x2={width} y1={line} y2={line} />;
            })}
            <path className="category-trend__line" d={path} stroke={color} />
          </svg>
          <div className="category-trend__labels"><span>{shortDay(points[0].day)}</span><span>{shortDay(points.at(-1)!.day)}</span></div>
        </>
      ) : (
        <div className="category-trend__empty">
          <ChartNoAxesCombined aria-hidden="true" size={20} />
          <span>No check-in points in the last {days} days. Your trend will appear after your next scored check-in.</span>
        </div>
      )}
    </Panel>
  );
}
