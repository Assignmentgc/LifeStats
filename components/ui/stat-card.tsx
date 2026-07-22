import type { ReactNode } from "react";

import { ProgressBar } from "./progress-bar";
import { STAT_LABELS, type StatTone } from "./types";
import { cn } from "./utils";

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
      <div>
        <div className="stat-card__name">{label}</div>
        {description ? <div className="stat-card__description">{description}</div> : null}
      </div>
      <div className="stat-card__value">{safeValue}</div>
      <div className="stat-card__progress">
        <ProgressBar value={safeValue} tone={tone} size="sm" />
      </div>
      {footer ? <div className="stat-card__footer">{footer}</div> : null}
    </div>
  );
}
