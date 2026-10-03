import { Activity, ChartNoAxesCombined } from "lucide-react";
import { Panel } from "@/components/ui";
import { STAT_META, STAT_NAMES, type StatName } from "@/lib/constants";

type Point = { label: string; value: number };

export type StatsAnalyticsProps = {
  monthlyProgress: Record<StatName, Point[]> | null;
};

const chartWidth = 600;
const chartHeight = 196;
const chartPadding = { top: 12, right: 10, bottom: 30, left: 10 };

function pointPosition(point: Point, index: number, length: number) {
  const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  return {
    x: chartPadding.left + (innerWidth * index) / Math.max(length - 1, 1),
    y: chartPadding.top + innerHeight * (1 - point.value / 100),
  };
}

function chartPath(points: Point[]) {
  return points
    .map((point, index) => {
      const { x, y } = pointPosition(point, index, points.length);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function StatsAnalytics({ monthlyProgress }: StatsAnalyticsProps) {
  return (
    <div className="stats-analytics">
      <Panel className="monthly-progress-card" padded>
        <div className="analytics-card__header">
          <div>
            <p className="eyebrow"><Activity aria-hidden="true" size={13} /> This month</p>
            <h2>Monthly progress</h2>
          </div>
        </div>
        <p className="analytics-card__description">Each line follows one character stat across the month.</p>
        {monthlyProgress ? <div className="monthly-chart" role="img" aria-label="Monthly progress chart for all character stats">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
            {[25, 50, 75].map((value) => {
              const { y } = pointPosition({ label: "", value }, 0, 1);
              return <line className="chart-grid-line" key={value} x1="0" x2={chartWidth} y1={y} y2={y} />;
            })}
            {STAT_NAMES.map((statName) => <path className="monthly-chart__line" d={chartPath(monthlyProgress[statName])} key={statName} stroke={STAT_META[statName].color} />)}
          </svg>
          <div className="chart-labels">{monthlyProgress[STAT_NAMES[0]].map((point, index) => <span key={`${point.label}-${index}`}>{point.label}</span>)}</div>
        </div>
        : <EmptyAnalyticsState message="Your monthly progress will begin with your next stat change." />}
        {monthlyProgress ? <div className="monthly-chart__legend">
          {STAT_NAMES.map((statName) => <span key={statName}><i style={{ backgroundColor: STAT_META[statName].color }} />{STAT_META[statName].label}</span>)}
        </div> : null}
      </Panel>
    </div>
  );
}

function EmptyAnalyticsState({ message }: { message: string }) {
  return <div className="analytics-empty"><ChartNoAxesCombined aria-hidden="true" size={20} /><span>{message}</span></div>;
}
