import type { HTMLAttributes } from "react";

import { STAT_LABELS, type StatTone } from "./types";
import { cn } from "./utils";

type StatTagProps = HTMLAttributes<HTMLSpanElement> & {
  tone: StatTone;
  children?: string;
};

export function StatTag({ tone, children, className, ...props }: StatTagProps) {
  return (
    <span className={cn("stat-tag", className)} data-tone={tone} {...props}>
      {children ?? STAT_LABELS[tone]}
    </span>
  );
}
