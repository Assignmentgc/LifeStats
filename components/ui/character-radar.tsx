import type { StatTone } from "./types";

type RadarStats = Record<StatTone, number>;

type CharacterRadarProps = {
  stats: RadarStats;
  className?: string;
};

const CENTER = 110;
const RADIUS = 76;

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

const radarTones: StatTone[] = ["health", "intellect", "progress", "social", "prosperity", "purpose"];

function radarPoint(index: number, value: number) {
  const distance = (clamp(value) / 100) * RADIUS;
  const angle = (Math.PI * 2 * index) / radarTones.length - Math.PI / 2;
  return `${CENTER + Math.cos(angle) * distance},${CENTER + Math.sin(angle) * distance}`;
}

/** A compact six-axis summary of the fixed LifeStats core model. */
export function CharacterRadar({ stats, className }: CharacterRadarProps) {
  const points = radarTones
    .map((tone, index) => radarPoint(index, stats[tone]))
    .join(" ");

  return (
    <svg
      className={["character-radar", className].filter(Boolean).join(" ")}
      viewBox="0 0 220 220"
      role="img"
      aria-label={`Life statistics: ${radarTones.map((tone) => `${tone} ${Math.round(stats[tone])}`).join(", ")}`}
    >
      <polygon className="character-radar__shape" points={points} />
      {radarTones.map((tone, index) => {
        const angle = (Math.PI * 2 * index) / radarTones.length - Math.PI / 2;
        const x = CENTER + Math.cos(angle) * 96;
        const y = CENTER + Math.sin(angle) * 96 + 4;
        return (
          <text className={`character-radar__label character-radar__label--${tone}`} key={tone} x={x} y={y} textAnchor="middle">
            {tone.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}
