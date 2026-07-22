import type { CSSProperties } from "react";

import type { StatTone } from "./types";
import { cn } from "./utils";

type ProgressBarProps = {
  value: number;
  tone?: StatTone | "xp";
  label?: string;
  valueLabel?: string;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function ProgressBar({
  value,
  tone = "xp",
  label,
  valueLabel,
  showValue = false,
  size = "md",
  className,
}: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const visibleValue = valueLabel ?? `${safeValue}%`;
  const showMeta = Boolean(label || showValue || valueLabel);

  return (
    <div
      className={cn("progress-bar", size !== "md" && `progress-bar--${size}`, className)}
      data-tone={tone === "xp" ? undefined : tone}
    >
      {showMeta ? (
        <div className="progress-bar__meta">
          <span>{label}</span>
          {(showValue || valueLabel) && <span className="progress-bar__value">{visibleValue}</span>}
        </div>
      ) : null}
      <div
        className="progress-bar__track"
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeValue}
      >
        <div
          className="progress-bar__fill"
          style={{ "--progress": `${safeValue}%` } as CSSProperties}
        />
      </div>
    </div>
  );
}
