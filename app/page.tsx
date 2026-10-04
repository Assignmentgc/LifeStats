import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  BookOpen,
  ChartLine,
  Flame,
  ListChecks,
  Sparkles,
  Star,
  Target,
  UserRound,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

const previewStats = [
  { name: "Purpose", value: 47, color: "#8b5cf6" },
  { name: "Vitality", value: 42, color: "#22c55e" },
  { name: "Social", value: 44, color: "#ec4899" },
  { name: "Finances", value: 38, color: "#e0b64d" },
  { name: "Discipline", value: 35, color: "#f59e0b" },
  { name: "Environment", value: 51, color: "#3b82f6" },
];

const features = [
  {
    icon: Activity,
    title: "RPG Character Stats",
    description:
      "Six core stats — Purpose, Vitality, Social, Finances, Discipline, and Environment — grow from direct substats shaped by your real actions.",
  },
  {
    icon: Bot,
    title: "AI Daily Check-Ins",
    description:
      "Just describe your day in plain words. Our AI extracts your activities and a fair, consistent scoring engine updates your character.",
  },
  {
    icon: ListChecks,
    title: "Habit Quests",
    description:
      "Turn habits into quests with XP rewards and daily streaks. Watching your streak grow is the motivation you needed.",
  },
  {
    icon: BookOpen,
    title: "Journal & Mood Tracking",
    description:
      "Capture quick reflections with an optional mood, saved alongside your daily check-ins.",
  },
  {
    icon: ChartLine,
    title: "Insights & Trends",
    description:
      "Monthly charts show how your stats evolve — see your growth, not guess it.",
  },
  {
    icon: UserRound,
    title: "Your Avatar",
    description:
      "A character that represents you, with a level and XP that grow as you do in real life.",
  },
];

const steps = [
  {
    icon: UserRound,
    title: "Create your character",
    description:
      "Sign up and start with a fresh character and six core stats — just like the beginning of every great RPG.",
  },
  {
    icon: Sparkles,
    title: "Check in daily",
    description:
      "Tell the AI about your day — workouts, study sessions, meals, moods. Complete habit quests and journal your reflections.",
  },
  {
    icon: Target,
    title: "Watch yourself level up",
    description:
      "Earn XP, build streaks, and see your six stats grow over weeks and months. Real progress, measured — and it feels amazing.",
  },
];

const testimonials = [
  {
    quote:
      "I've tried every habit tracker out there. This is the first one I actually open every single day — I don't want to lose my streak.",
    name: "Maya R.",
    role: "Level 14 · 87-day streak",
  },
  {
    quote:
      "Describing my day to the AI check-in takes two minutes, and somehow it makes me want to do more just so my stats look better tomorrow.",
    name: "Jordan K.",
    role: "Level 8 · Discipline +12 this month",
  },
  {
    quote:
      "Seeing my Quality of Life chart trend upward over three months is proof that the small stuff adds up. Worth every minute.",
    name: "Sam T.",
    role: "Level 11 · 6 habits active",
  },
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav__inner">
          <Link className="landing-brand" href="/" aria-label="LifeStats home">
            <span className="landing-brand__mark" aria-hidden="true">
              <BrandMark />
            </span>
            <span>LifeStats</span>
          </Link>

          <nav className="landing-nav__links" aria-label="Landing page navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#testimonials">Testimonials</a>
          </nav>

          <div className="landing-nav__actions">
            <Link className="landing-login" href="/login">
              Log in
            </Link>
            <Link className="landing-button landing-button--small" href="/sign-up">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__glow" aria-hidden="true" />
        <div className="landing-container landing-hero__grid">
          <div className="landing-hero__copy">
            <p className="landing-kicker">
              <Sparkles size={13} />
              Level up your real life
            </p>
            <h1>
              Turn your life into the ultimate <span>RPG</span>
            </h1>
            <p className="landing-lede">
              LifeStats turns your daily habits, check-ins and reflections into character
              stats, XP and levels — so personal growth feels like playing your favorite game.
            </p>
            <div className="landing-hero__buttons">
              <Link className="landing-button" href="/sign-up">
                Get Started <ArrowRight size={17} />
              </Link>
              <a className="landing-button landing-button--outline" href="#how-it-works">
                See how it works
              </a>
            </div>
            <dl className="landing-figures">
              <div>
                <dt>6</dt>
                <dd>Core stats</dd>
              </div>
              <div>
                <dt>38</dt>
                <dd>Substats tracked</dd>
              </div>
              <div>
                <dt>∞</dt>
                <dd>Levels to gain</dd>
              </div>
            </dl>
          </div>

          <div className="landing-preview" aria-label="Sample LifeStats character dashboard">
            <div className="landing-preview__header">
              <div className="landing-preview__avatar">🧙</div>
              <div>
                <p>Aria</p>
                <span>Level 9 · 1,550 XP</span>
              </div>
              <div className="landing-preview__streak">
                <Flame size={17} />
                <strong>10</strong>
                <span>day streak</span>
              </div>
            </div>
            <div className="landing-preview__xp" aria-label="62 percent XP progress">
              <span />
            </div>
            <div className="landing-preview__stats">
              {previewStats.map((stat) => (
                <div className="landing-preview__stat" key={stat.name}>
                  <strong style={{ color: stat.color }}>{stat.value}</strong>
                  <span>{stat.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="features">
        <div className="landing-container">
          <div className="landing-section__heading">
            <p>Features</p>
            <h2>Everything you need to grow</h2>
            <span>
              A complete self-improvement system disguised as a game you actually want to play
              every day.
            </span>
          </div>
          <div className="landing-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="landing-card landing-feature" key={feature.title}>
                  <span className="landing-card__icon">
                    <Icon size={22} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="landing-container">
          <div className="landing-section__heading">
            <p>How it works</p>
            <h2>Your quest starts in minutes</h2>
          </div>
          <div className="landing-step-grid">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article className="landing-card landing-step" key={step.title}>
                  <span className="landing-step__number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="landing-card__icon">
                    <Icon size={22} />
                  </span>
                  <p className="landing-step__label">Step {index + 1}</p>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-section" id="testimonials">
        <div className="landing-container">
          <div className="landing-section__heading">
            <p>Testimonials</p>
            <h2>Players are leveling up IRL</h2>
          </div>
          <div className="landing-testimonial-grid">
            {testimonials.map((testimonial) => (
              <figure className="landing-card landing-testimonial" key={testimonial.name}>
                <div className="landing-stars" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} size={15} fill="currentColor" />
                  ))}
                </div>
                <blockquote>“{testimonial.quote}”</blockquote>
                <figcaption>
                  <strong>{testimonial.name}</strong>
                  <span>{testimonial.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <section className="landing-final-cta">
            <div className="landing-final-cta__glow" aria-hidden="true" />
            <h2>Your quest starts today</h2>
            <p>
              Create your character, complete daily habits, and watch the XP roll in. The game is
              waiting.
            </p>
            <Link className="landing-button" href="/sign-up">
              Start your adventure <ArrowRight size={17} />
            </Link>
          </section>
          <div className="landing-footer__bottom">
            <Link className="landing-brand" href="/">
              <span className="landing-brand__mark" aria-hidden="true">
                <BrandMark />
              </span>
              <span>LifeStats</span>
            </Link>
            <p>Built for players of real life. © 2026 LifeStats.</p>
            <div>
              <Link href="/login">Log in</Link>
              <Link href="/sign-up">Sign up</Link>
              <Link href="/privacy">Privacy</Link>
              <a href="mailto:lifestatsfun@gmail.com?subject=LifeStats%20account%20deletion">
                Request account deletion
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
