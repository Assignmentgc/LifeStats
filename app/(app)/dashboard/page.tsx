import Link from "next/link";
import { Flame, Settings, Sparkles } from "lucide-react";
import { QuestList } from "@/components/quests/quest-list";
import {
  LevelBadge,
  ProgressBar,
  SectionHeading,
  StatCard,
} from "@/components/ui";
import { STAT_NAMES } from "@/lib/constants";
import { getDashboardData } from "@/lib/data";
import { formatNumber } from "@/lib/utils";

export default async function DashboardPage() {
  const { user, stats, quests, progress } = await getDashboardData();
  const displayName = (user.email?.split("@")[0] || "Adventurer")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const completedToday = quests.filter((quest) => quest.is_daily && quest.is_completed).length;
  const dailyQuests = quests.filter((quest) => quest.is_daily && !quest.is_completed);
  const questPreview = (dailyQuests.length ? dailyQuests : quests.filter((quest) => !quest.is_completed)).slice(0, 3);

  return (
    <main className="page-container dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1 className="sheet-title">{displayName}</h1>
        </div>
        <Link className="dashboard-settings" href="/stats" aria-label="View character stats">
          <Settings aria-hidden="true" size={18} />
        </Link>
      </header>

      <section className="character-card" aria-label="Your character">
        <div className="character-avatar" aria-hidden="true">
          <span className="character-avatar__head" />
          <span className="character-avatar__body" />
        </div>
        <div className="character-card__content">
          <h2>Your Character</h2>
          <p>Build the life you want, one quest at a time.</p>
          <Link className="character-customize" href="/stats">
            <Sparkles aria-hidden="true" size={15} /> Customize
          </Link>
        </div>
      </section>

      <section className="xp-section level-card" aria-label="Experience progress">
        <div className="level-card__summary">
          <LevelBadge level={progress.level} caption="Level" />
          <div>
            <p>Level {progress.level}</p>
            <strong>{formatNumber(progress.totalXp)} Total XP</strong>
          </div>
          <span className="level-card__streak">
            <Flame aria-hidden="true" size={17} />
            <strong>{completedToday}</strong> today
          </span>
        </div>
        <ProgressBar
          label="XP"
          showValue
          size="sm"
          value={progress.progressPercent}
          valueLabel={`${formatNumber(progress.xpIntoLevel)} / ${formatNumber(progress.xpForLevel)}`}
        />
      </section>

      <section id="stats" aria-label="Character statistics">
        <SectionHeading
          title="Character Stats"
          action={<Link className="section-link" href="/stats">View all ›</Link>}
        />
        <div className="stats-list dashboard-stats">
          {STAT_NAMES.map((name) => {
            const stat = stats.find((item) => item.stat_name === name);
            return (
              <StatCard
                key={name}
                tone={name}
                value={stat?.value ?? 0}
              />
            );
          })}
        </div>
      </section>

      <SectionHeading
        title="Daily Quests"
        action={<Link className="section-link" href="/quests">View all ›</Link>}
      />
      <QuestList
        quests={questPreview}
        variant="daily"
        emptyTitle="Your daily quests are clear"
        emptyDescription="Add a quest to give today an easy win."
      />
    </main>
  );
}
