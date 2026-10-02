import type { CSSProperties, ReactNode } from "react";

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
  label?: string;
  description?: string;
  footer?: ReactNode;
  className?: string;
};

/** A labeled stat readout with the matching stat color and progress bar. */
export function StatCard({
  tone,
  value,
  label = STAT_LABELS[tone],
  description,
  footer,
  className,
}: StatCardProps) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={cn("stat-card", className)} data-tone={tone}>
      <div
        className="stat-card__gauge"
        style={{ "--stat-progress": `${safeValue}%` } as CSSProperties}
        aria-hidden="true"
      >
        <span className="stat-card__gauge-inner">{statIcons[tone]}</span>
      </div>
      <div className="stat-card__name">{label}</div>
      <div className="stat-card__value">{safeValue}</div>
      {description ? <div className="stat-card__description">{description}</div> : null}
      {footer ? <div className="stat-card__footer">{footer}</div> : null}
    </div>
  );
}
