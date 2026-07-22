import type { ReactNode } from "react";

import { cn } from "./utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      <div className="empty-state__content">
        <h3 className="empty-state__title">{title}</h3>
        {description ? <p className="empty-state__description">{description}</p> : null}
        {action ? <div className="empty-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
