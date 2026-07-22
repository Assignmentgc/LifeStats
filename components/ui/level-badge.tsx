type LevelBadgeProps = {
  level: number;
  caption?: string;
  className?: string;
};

export function LevelBadge({ level, caption = "Real life", className }: LevelBadgeProps) {
  return (
    <output className={["level-badge", className].filter(Boolean).join(" ")} aria-label={`Level ${level}`}>
      <span className="level-badge__level">LVL {Math.max(0, Math.floor(level))}</span>
      <span className="level-badge__caption">{caption}</span>
    </output>
  );
}
