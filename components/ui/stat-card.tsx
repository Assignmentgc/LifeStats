import type { ReactNode } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";

import { STAT_LABELS, type StatTone } from "./types";
import { cn } from "./utils";

const statIcons: Record<StatTone, string> = {
  vitality: "ϟ",
  discipline: "♨",
  social: "⌁",
  purpose: "◎",
  finances: "¤",
  environment: "◌",
};

type StatCardProps = {
  tone: StatTone;
  value: number;
  latestGain?: number | null;
  label?: string;
  description?: string;
  footer?: ReactNode;
  className?: string;
};

/** Cumulative check-in points, with category details available on activation. */
export function StatCard({
  tone,
  value,
  latestGain,
  label = STAT_LABELS[tone],
  description,
  footer,
  className,
}: StatCardProps) {
  return (
    <Link href={`/stats/${tone}`} className={cn("stat-card", "stat-card--cumulative", className)} data-tone={tone}>
      <div
        className="stat-card__gauge"
        aria-hidden="true"
      >
        <span className="stat-card__gauge-inner">{statIcons[tone]}</span>
      </div>
      <div className="stat-card__name">{label}</div>
      <div className="stat-card__value">{formatNumber(value)}<small>points</small></div>
      {latestGain !== undefined ? (
        <div className="stat-card__gain" data-increased={latestGain !== null && latestGain > 0}>
          {latestGain === null ? "Latest gain unavailable" : `+${formatNumber(latestGain)} latest check-in`}
        </div>
      ) : null}
      {description ? <div className="stat-card__description">{description}</div> : null}
      {footer ? <div className="stat-card__footer">{footer}</div> : null}
      <span className="stat-card__details">View individual scores</span>
    </Link>
  );
}
