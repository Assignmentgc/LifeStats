# LifeStats

Next.js and Supabase life-stat tracking with US-English text and on-device voice check-ins.

The website is installable as a PWA, and [`android/`](./android/README.md) packages
it as an Android app (Trusted Web Activity) that loads the live site.

## Check-in setup

1. Install dependencies with `npm install`.
2. Apply **all** Supabase migrations in timestamp order (`supabase db push`).
   The evidence migration preserves existing scores and historical check-ins.
   The scheduling migration requires Supabase's `pg_cron` extension.
3. Set the server-only values from [.env.example](./.env.example) in your local
   environment and deployment secrets:
   - `PERPLEXITY_API_KEY`
   - `PERPLEXITY_MODEL` (default: `google/gemini-3.1-flash-lite`, a non-OpenAI model)
   - `SUPABASE_SERVICE_ROLE_KEY`: a Supabase `sb_secret_...` key or legacy
     `service_role` JWT from Project Settings > API Keys (never expose this
     to the browser). Do not copy `NEXT_PUBLIC_SUPABASE_ANON_KEY` here: the
     publishable/anon key cannot call protected evidence-writing RPCs.
4. Review Perplexity Agent API and selected-model retention/processing policies,
   update your privacy notice, then explicitly set
   `PERPLEXITY_CHECK_INS_ENABLED=true`. The default is disabled. The published
   Chat Completions zero-retention policy must not be assumed to cover every
   Agent API/model configuration.
5. Build/start with `npm run build` and `npm start`, or develop with `npm run dev`.

The backend calls Perplexity's Agent API with no search/tools, `store: false`,
and a constrained JSON schema. It sends only the final text, tracking settings,
bounded recent-session acknowledgements, today's evidence, and completed quests;
it does not send the full journal history or microphone audio. Users must consent
before submitting. API keys and journal/provider bodies are not logged.

The provider schema omits `maxItems` because the configured Gemini model rejects
that keyword through Perplexity. The prompt requests at most 12 evidence items;
backend validation and the database enforce that limit before saving.

## Voice and language

Only `en-US` is supported. Non-English or unclear input is saved as a request for
English clarification, without translation or scoring evidence.

The microphone uses browser speech recognition **only** when `processLocally`
and local-language availability checks are supported. It never falls back to
remote recognition. A user-initiated language-pack download may be required.
Unsupported devices keep editable text and keyboard dictation available;
keyboard dictation's own processing/privacy behavior is controlled by the OS.
Stop recording and review the final transcript before submitting.

If microphone setup fails, the form shows the specific failure and setup steps.
Open LifeStats in a regular, up-to-date desktop browser rather than an embedded
editor preview, using HTTPS or localhost. The browser must expose local speech
recognition and offer an `en-US` pack; normal browser speech recognition support
or granting microphone permission alone is insufficient. Downloadable packs are
installed on a user-initiated microphone attempt and checked again before use.
After installation, allow this site's microphone and system microphone access
(Windows: Settings > Privacy & security > Microphone > desktop apps), then click
On-device microphone again. Unsupported browsers/devices remain text-only;
Windows keyboard dictation (Win+H) is an optional OS-controlled alternative and
is not guaranteed to process audio locally.

TTS is optional and uses only a local `en-US` system/browser voice. If no local
voice exists or playback fails, the app explicitly reports it and keeps the
written response. Both automatic playback ("Read responses aloud") and "Read
response" include the acknowledgement, optional practical tip, and follow-up
question. A native mobile shell is not included in this web release.

When a saved or restored check-in includes a follow-up question, the input becomes
an explicitly labelled follow-up response field. "Answer follow-up" focuses that
field; typing and on-device dictation use the same editable draft. "Send follow-up
response" saves the answer as another entry in the same session, using the recent
questions as compact context without resending the original journal entry.
Failed submissions preserve the draft and request ID for safe retries.

## Evidence and daily scores

Check-ins save original text, English normalization, traceable quotes, confidence,
safety flags, acknowledgement, and at most one follow-up question atomically.
Retrying the same request does not create a second entry. Request IDs with changed
content are rejected. Session IDs are scoped to the signed-in user.

Saved check-ins **immediately update persistent substat scores** and derived base
stats. Dashboard and Stats cards show **cumulative applied check-in points per
category**, summed across every saved daily ledger, plus the points added by the
latest individual check-in. Lifetime category totals are uncapped and are separate
from the 0–100 averaged base stats used by LifeScore and analytics.
They do not use daily/session totals as that entry's gain. Each new entry records
its actual category impact atomically; retries retain the original impact, repeated
activities and no-gain entries show +0, and substats clamped at 100 report only the
actual increase. Entries saved before the per-entry migration show "Latest gain
unavailable" rather than invented historical deltas. Existing progress remains visible.
Saved check-ins and follow-up replies appear alongside manual entries in the Journal,
labelled "Daily check-in", without copying or resubmitting them. Opening check-in in a
new tab or browser restores the signed-in user's latest saved session from the database.
After a successful save, a Server Action invalidates Dashboard, Stats, and Journal
views, including previously visited client routes. Exact substat values are visible
by selecting a category card on Dashboard or Stats. For example, +2 Fitness and
+3 Sleep add **5 Vitality points** and **5 XP**. Individual category pages show
current saved substat scores alongside each substat's lifetime check-in points.

Daily rules (version 3):

- Only today's evidence with both entry and evidence confidence **at least 0.8**
  is eligible. Confidence is a model estimate, not a calibrated probability.
- Any safety flag excludes that entire entry from scoring.
- Perplexity proposes **+1 to +5** per positive activity, including decimals.
  The backend rejects out-of-range gains and stores two decimal places.
  Repeated activity keys are deduplicated using the smallest eligible proposed
  gain, so repeating an activity cannot increase its reward. Contradictory
  positive/negative reports are neutral before awarding; negative evidence never
  deducts points. Later contradictions or lower estimates do not revoke previously
  applied gains. The daily allowance is a nondecreasing high-water mark: only an
  increase beyond the already consumed allowance can award additional points.
- Total check-in gains are capped at **+5 per substat/day**, across all sessions.
  No eligible evidence means no gain. Scores stay within 0–100; reaching 100
  can reduce the actual applied increment below 1. Character Stat cards sum lifetime
  applied points; persisted base-stat history and LifeScore remain rounded averages.
  Substat scores preserve decimal gains.
- Check-ins award **1 XP per actually applied substat point**, preserving decimals.
  Daily habits retain their XP rewards; one-time quests retain stat gains without XP.
  Historical check-in ledger gains are credited once by the progress/XP migration,
  without re-scoring entries or changing current substat values. Unique per-user/day/
  substat XP rows prevent retries and day closure from awarding XP again.
  Habit/quest stat rewards are unchanged and outside the check-in daily cap.
- Overall **Level 0 becomes Level 1 at 100 total XP**. Total XP combines habit and
  check-in awards. Existing higher thresholds remain `level² × 100` (Level 2 at 400).
  Numeric XP storage and the authenticated progress RPC preserve fractional totals
  so, for example, 99.99 XP stays Level 0 and 100 XP becomes Level 1.
- Plans, historical/unclear timing, missing evidence, illness, sadness, rest, or
  asking for help must not be interpreted as completed actions or penalties.
- Explicitly linked completed quests and exact normalized quest-title/activity
  matches are excluded. Semantic matching/key reuse is model-assisted: arbitrary
  paraphrases are not guaranteed to deduplicate and require evaluation before
  relying on scores for anything beyond personal reflection.
- Spirituality follows existing settings. Base stats and LifeScore retain their
  existing formulas. New check-ins no longer invent a separate QoL rating;
  historical QoL records are preserved.

The first check-in fixes the account's check-in timezone to the device's IANA
timezone. Changing that timezone is intentionally not supported in this release.
Each save atomically persists evidence and applies only the unconsumed daily gain.
An hourly database job closes local days after a five-minute grace period without
awarding the same gains again. The immediate-scoring migration also applies eligible
previously pending entries without another Perplexity request. Evidence, applied
deltas, rule version, and history remain auditable. Closed-day edits/backdated
submissions are not supported.

See [Supabase setup and scheduler checks](./supabase/README.md).

## Validation

```text
npm run test:check-in
npm run typecheck
npm run lint
npm run build
```

Check-in tests use mocked Perplexity HTTP responses and isolated PostgreSQL
(PGlite); they never contact Perplexity or a deployed database. They cover schema,
locale, evidence eligibility, confidence thresholds, retry deduplication, caps,
score clamping, quest exclusion, access controls, local-day/DST boundaries, and
on-device/local-voice guards. Real-model US-English extraction accuracy and
microphone/voice hardware behavior still require deployment/device acceptance
testing with synthetic entries.