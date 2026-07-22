import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { QuestList } from "@/components/quests/quest-list";
import {
  CharacterRadar,
  LevelBadge,
  Panel,
  ProgressBar,
  SectionHeading,
  StatCard,
} from "@/components/ui";
import { STAT_NAMES } from "@/lib/constants";
import { getDashboardData } from "@/lib/data";
import { formatNumber } from "@/lib/utils";

export default async function DashboardPage() {
  const { user, stats, quests, progress } = await getDashboardData();
  const statsByName = Object.fromEntries(stats.map((stat) => [stat.stat_name, stat.value]));
  const displayName = user.email?.split("@")[0] || "Adventurer";

  return (
    <main className="page-container">
      <header className="sheet-header">
        <div>
          <p className="eyebrow">Character sheet</p>
          <h1 className="sheet-title">{displayName}</h1>
        </div>
        <LevelBadge level={progress.level} />
      </header>

      <section className="xp-section" aria-label="Experience progress">
        <ProgressBar
          label="Experience"
          showValue
          size="lg"
          value={progress.progressPercent}
          valueLabel={`${formatNumber(progress.xpIntoLevel)} / ${formatNumber(progress.xpForLevel)} XP`}
        />
        <p>{formatNumber(progress.totalXp)} total XP · {formatNumber(progress.xpToNextLevel)} to level {progress.level + 1}</p>
      </section>

      <section className="dashboard-grid" aria-label="Character statistics">
        <Panel className="radar-panel">
          <p className="eyebrow">Balance of power</p>
          <CharacterRadar
            stats={{
              vitality: Number(statsByName.vitality ?? 0),
              social: Number(statsByName.social ?? 0),
              career: Number(statsByName.career ?? 0),
              mind: Number(statsByName.mind ?? 0),
            }}
          />
          <p className="radar-panel__caption">Your quests build the shape.</p>
        </Panel>
        <div className="stats-list">
          {STAT_NAMES.map((name) => {
            const stat = stats.find((item) => item.stat_name === name);
            return (
              <StatCard
                key={name}
                tone={name}
                value={stat?.value ?? 0}
                description={
                  name === "vitality" ? "Sleep, movement, food" :
                  name === "social" ? "Friends, connection, dating" :
                  name === "career" ? "Work, skills, money" : "Learning, reflection, calm"
                }
              />
            );
          })}
        </div>
      </section>

      <SectionHeading
        title="Active quests"
        description="Complete a quest to earn XP and raise its linked stat."
        action={
          <Link className="button button--secondary button--sm" href="/quests">
            Quest log <ArrowRight aria-hidden="true" size={14} />
          </Link>
        }
      />
      <QuestList
        quests={quests}
        emptyTitle="Your quest log is clear"
        emptyDescription="Open the Quest Log to add your first objective."
      />
    </main>
  );
}
