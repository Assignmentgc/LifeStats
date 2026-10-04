import Link from "next/link";
import { ChartLine, ListTodo, Settings } from "lucide-react";
import {
  LevelBadge,
  ProgressBar,
  SectionHeading,
  StatCard,
} from "@/components/ui";
import { STAT_NAMES } from "@/lib/constants";
import { getDashboardData } from "@/lib/data";
import { formatNumber } from "@/lib/utils";
import { getDisplayName } from "@/lib/user-name";

export default async function DashboardPage() {
  const { user, checkInPoints, latestCheckInGains, progress, todos, lifeScore } = await getDashboardData();
  const displayName = getDisplayName(user);

  return (
    <main className="page-container dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1 className="sheet-title">{displayName}</h1>
        </div>
        <Link className="dashboard-settings" href="/settings" aria-label="Open settings">
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
          <p>Build the life you want, one check-in at a time.</p>
          <Link className="character-customize" href="/stats">
            <ChartLine aria-hidden="true" size={15} /> View stats
          </Link>
        </div>
      </section>

      <section className="life-score-card life-score-card--compact" aria-label={`LifeScore ${lifeScore} out of 100`}>
        <div><p className="eyebrow">Weighted overall score</p><h2>LifeScore</h2></div><strong>{lifeScore}<small>/100</small></strong>
      </section>

      <section className="xp-section level-card" aria-label="Experience progress">
        <div className="level-card__summary">
          <LevelBadge level={progress.level} caption="Level" />
          <div>
            <p>Level {progress.level}</p>
            <strong>{formatNumber(progress.totalXp)} Total XP</strong>
          </div>
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
        <p className="check-in-result__quiet">All-time check-in points, plus your latest check-in&apos;s impact. Select a category to see individual scores.</p>
        <div className="stats-list dashboard-stats">
          {STAT_NAMES.map((name) => {
            return (
              <StatCard
                key={name}
                tone={name}
                value={checkInPoints.categories[name]}
                latestGain={latestCheckInGains === null ? null : latestCheckInGains?.[name]}
              />
            );
          })}
        </div>
      </section>

      <section className="dashboard-check-in">
        <div>
          <p className="eyebrow">Daily reflection</p>
          <h2>What did you do today?</h2>
          <p>Save evidence from your day. Eligible gains update your Life Stats immediately, capped at +5 per substat per day.</p>
        </div>
        <Link className="button button--primary" href="/check-in">Check in now</Link>
      </section>

      <Link className="dashboard-todo-card" href="/todo">
        <div className="dashboard-todo-card__icon"><ListTodo aria-hidden="true" size={19} /></div>
        <div><p className="eyebrow">To-Do</p><h2>{todos.length ? `${todos.length} task${todos.length === 1 ? "" : "s"} to focus on` : "Your task list is clear"}</h2><p>{todos.length ? todos.map((todo) => todo.title).join(" · ") : "Add and prioritize your next actions."}</p></div>
        <span aria-hidden="true">›</span>
      </Link>
    </main>
  );
}
