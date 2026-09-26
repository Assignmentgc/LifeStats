import type { StatTone } from "./types";

type RadarStats = Pick<Record<StatTone, number>, "vitality" | "strength" | "discipline" | "intellect">;

type CharacterRadarProps = {
  stats: RadarStats;
  className?: string;
};

const CENTER = 110;
const RADIUS = 76;

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function radarPoint(tone: StatTone, value: number) {
  const distance = (clamp(value) / 100) * RADIUS;

  switch (tone) {
    case "vitality":
      return `${CENTER},${CENTER - distance}`;
    case "strength":
      return `${CENTER + distance},${CENTER}`;
    case "discipline":
      return `${CENTER},${CENTER + distance}`;
    case "intellect":
      return `${CENTER - distance},${CENTER}`;
    default:
      return `${CENTER},${CENTER}`;
  }
}

/** A compact four-axis character-sheet summary for the dashboard. */
export function CharacterRadar({ stats, className }: CharacterRadarProps) {
  const points = (["vitality", "strength", "discipline", "intellect"] as const)
    .map((tone) => radarPoint(tone, stats[tone]))
    .join(" ");

  return (
    <svg
      className={["character-radar", className].filter(Boolean).join(" ")}
      viewBox="0 0 220 220"
      role="img"
      aria-label={`Character stats: Vitality ${Math.round(stats.vitality)}, Strength ${Math.round(
        stats.strength,
      )}, Discipline ${Math.round(stats.discipline)}, Intellect ${Math.round(stats.intellect)}`}
    >
      <polygon className="character-radar__grid" points="110,20 200,110 110,200 20,110" />
      <polygon className="character-radar__grid" points="110,50 170,110 110,170 50,110" />
      <polygon className="character-radar__grid" points="110,80 140,110 110,140 80,110" />
      <line className="character-radar__axis" x1="110" y1="20" x2="110" y2="200" />
      <line className="character-radar__axis" x1="20" y1="110" x2="200" y2="110" />
      <polygon className="character-radar__shape" points={points} />
      <text className="character-radar__label character-radar__label--vitality" x="110" y="12" textAnchor="middle">
        VITALITY
      </text>
      <text className="character-radar__label character-radar__label--strength" x="207" y="114">
        STRENGTH
      </text>
      <text className="character-radar__label character-radar__label--discipline" x="110" y="216" textAnchor="middle">
        DISCIPLINE
      </text>
      <text className="character-radar__label character-radar__label--intellect" x="13" y="114" textAnchor="end">
        INTELLECT
      </text>
    </svg>
  );
}
