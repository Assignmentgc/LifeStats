import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How LifeStats handles account information, journal entries, and AI check-ins.",
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-nav">
        <div className="privacy-nav__inner">
          <Link className="landing-brand" href="/" aria-label="LifeStats home">
            <span className="landing-brand__mark" aria-hidden="true">
              <BrandMark />
            </span>
            <span>LifeStats</span>
          </Link>
          <Link className="privacy-nav__back" href="/">Back to LifeStats</Link>
        </div>
      </header>

      <article className="privacy-content">
        <header className="privacy-heading">
          <p className="eyebrow">Your data, your choice</p>
          <h1 className="page-title">Privacy Policy</h1>
          <p className="page-description">Effective October 4, 2026</p>
          <p>
            LifeStats is a personal growth tracker for your journal, habits, quests, stats,
            and optional AI check-ins. This policy covers the LifeStats website and the
            LifeStats Android app, which opens the same website in your device&apos;s
            browser. It explains what the service handles and when information goes to
            another provider.
          </p>
        </header>

        <section className="privacy-section">
          <h2>We do not share your personal information</h2>
          <p>
            LifeStats does not share your personal information for advertising, and we
            do not rent or sell it. We do not currently use third-party advertising or
            analytics trackers. We share limited information with service providers
            only as described below to operate the features you choose, protect the
            service, or comply with law.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Information LifeStats handles</h2>
          <ul>
            <li>
              <strong>Account details:</strong> your first and last name, email address,
              and account credentials. Supabase Auth manages your password; LifeStats
              does not receive or store your plain-text password.
            </li>
            <li>
              <strong>Your LifeStats content:</strong> journal text and optional mood,
              habits, quests, to-do items, check-in text and replies, and the stats,
              scores, progress, and XP created from your activity.
            </li>
            <li>
              <strong>Check-in details:</strong> when you use an AI check-in, the service
              stores the submitted text and may store its English-normalized text,
              generated acknowledgement and suggestions, follow-up, extracted evidence,
              confidence estimates, safety flags, scoring results, and timestamps.
            </li>
            <li>
              <strong>Settings and technical data:</strong> preferences such as theme,
              spirituality and time zone, authentication/session cookies, and temporary
              browser storage used to restore a check-in session. Hosting infrastructure
              may also process request and device information, such as IP address and
              browser details, for delivery, reliability, and security.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>How we use information</h2>
          <p>
            We use account details to create and secure your account; your content to
            provide the journal, quests, reminders, stats, and check-in history you ask
            for; and settings to personalize those features. We also use limited
            operational information to maintain the service, prevent abuse, troubleshoot
            failures, and meet legal obligations. We do not use your private entries to
            serve advertisements.
          </p>
        </section>

        <section className="privacy-section">
          <h2>AI check-ins: what is shared</h2>
          <p>
            An AI check-in is optional and requires your consent before submission. If
            you submit one, LifeStats sends the text you entered and limited context to
            Perplexity AI for analysis. That context can include your name, selected
            tracking settings, up to three recent check-in acknowledgements and
            follow-up questions, recent evidence for today, and completed quests for
            today. The service does not send your full journal history or microphone
            audio to Perplexity.
          </p>
          <p>
            Perplexity processes that information to return the check-in response. The
            current integration requests <code>store: false</code>, but that request is
            not a guarantee about provider retention or processing. Perplexity handles
            information under its own terms and privacy practices. Do not include
            information in a check-in that you do not want processed by this provider.
            You can decline consent and continue using other LifeStats features.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Providers and other disclosures</h2>
          <ul>
            <li>
              <strong>Supabase</strong> provides account authentication and database
              services that store your LifeStats account and content.
            </li>
            <li>
              <strong>Perplexity AI</strong> receives the check-in information described
              above only when you submit an AI check-in with consent.
            </li>
            <li>
              <strong>Google Fonts</strong> supplies fonts used by the website. Your
              browser requests font files directly from Google, which can receive
              technical connection information such as your IP address and browser
              details. Font requests do not include your LifeStats journal or account
              profile.
            </li>
            <li>
              The hosting provider may process technical data to deliver and secure the
              website. Providers may process data in countries other than yours under
              their own terms.
            </li>
          </ul>
          <p>
            We may also disclose information when required by law or when reasonably
            necessary to protect users, the service, or another person. We do not
            disclose personal details to data brokers or advertisers.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Microphone, speech, and browser storage</h2>
          <p>
            When supported, microphone dictation uses your browser&apos;s on-device
            US-English speech recognition. LifeStats does not intentionally upload or
            store the microphone audio; after you review and submit the resulting text,
            that text is handled as an AI check-in. Browser or keyboard dictation
            supplied by your device may have separate processing controlled by its
            manufacturer or provider. Optional read-aloud uses an available local
            browser or system voice.
          </p>
          <p>
            The site uses authentication cookies to keep you signed in, local storage
            for your theme choice, and session storage for temporary check-in session
            identifiers. These are functional storage, not advertising cookies. You
            can manage or clear browser storage in your browser settings; clearing it
            may sign you out or interrupt session restoration.
          </p>
        </section>

        <section className="privacy-section" id="delete-account">
          <h2>Retention, access, and deletion</h2>
          <p>
            Your account and saved content remain in the service database while the
            account is active, unless removed sooner. You can manage or delete some
            content in the app, including journal entries, quests, and to-do items.
            This version does not provide a self-service account deletion or data export tool.
          </p>
          <p>
            <strong>To delete your account and data</strong>, email{" "}
            <a href="mailto:ramu.gentala@gmail.com?subject=LifeStats%20account%20deletion">
              ramu.gentala@gmail.com
            </a>{" "}
            from the address you use to sign in, with the subject &quot;LifeStats account
            deletion&quot;. We will delete your account and its associated content
            (journal entries, check-ins, habits, quests, to-do items, stats, and XP)
            within 30 days and confirm by email. You can use the same address to ask for
            a copy of your information. Residual copies may remain in provider backups
            for a limited period, or where we must keep them to meet legal obligations.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Security</h2>
          <p>
            LifeStats uses authenticated access and user-scoped database policies to
            limit access to account content. No internet service can promise absolute
            security, so please use a unique password and avoid putting passwords,
            payment-card details, or secrets into journal entries or check-ins.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Children, changes, and contact</h2>
          <p>
            LifeStats is not designed for children and does not knowingly collect
            personal information from children under 13. If you believe a child has
            done so, email{" "}
            <a href="mailto:ramu.gentala@gmail.com">ramu.gentala@gmail.com</a> to
            request removal.
          </p>
          <p>
            We may update this policy when the service changes. The effective date at
            the top shows when this version was last updated. For privacy questions or
            requests, email{" "}
            <a href="mailto:ramu.gentala@gmail.com">ramu.gentala@gmail.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
