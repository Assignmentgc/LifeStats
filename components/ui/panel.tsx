import type { HTMLAttributes } from "react";

import type { StatTone } from "./types";
import { cn } from "./utils";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: StatTone;
  padded?: boolean;
  inset?: boolean;
};

/** A dark character-sheet card, optionally tied to one of the four life stats. */
export function Panel({
  className,
  tone,
  padded = true,
  inset = false,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn("panel", padded && "panel--padded", inset && "panel--inset", className)}
      data-tone={tone}
      {...props}
    />
  );
}
