# Spark (working name)

A private two-person app that helps a couple stay connected for the long term: catch drift early, turn good intentions into small repeated actions, and make hard conversations easier. Mobile-first, warm, built for exactly two people.

**Phase 1** is in this repo: email sign-in and pairing, profiles with personal themes, Our Story timeline, private onboarding questionnaires, weekly pulse, monthly check-in with hidden-until-both reveal and an AI summary, appreciation notes, activity log with ratings, a Claude-powered date idea generator, cadence negotiation, a social media agreement, and **Moments** (a private feed of clips, photos, links and notes for the two of you). Later phases are in [ROADMAP.md](ROADMAP.md).

## How the app feels (2026-10-06 update)

- **Home has no repeats of the bottom bar.** It shows a greeting, anything worth celebrating soon, and each person's own **favorites** (default: Date ideas, Appreciation notes, Our Story, Questions; editable, saved per person on their device). Every list is a row with everything on the left and an arrow on the right; tapping opens that screen full size, sliding in from the right, with the tab bar stepping aside and a back link at the top.
- **Check-ins come to you.** The monthly check-in pops up every month until you've done it. Between monthly ones, the quick check-in pops up whenever your agreed rhythm says it's due. "Not now" hides it for this visit only.
- **You re-agree the pace each month.** The monthly form asks "Should our quick check-ins come sooner or later than now?" The vote is encrypted with the answers and revealed with them. The rhythm starts as the split of both picks and moves one step only when both vote the same way (`src/lib/domain/rhythm.ts`).

## Principles the code enforces

1. **No tracking or monitoring.** No location, no activity surveillance, no third-party embeds in the feed.
2. **Private answers stay private.** Onboarding answers are readable only by their author, enforced by Postgres Row Level Security (RLS) and encrypted at rest. Phase 1 shares nothing from them.
3. **Hidden until both submit.** Monthly check-in answers and weekly pulse scores are revealed to the partner only after both have submitted, enforced in the database.
4. **No manipulation, no guilt.** Supportive framing, no streaks, no blame. AI prompts forbid tracking, withholding, retaliation and ultimatums.
5. **18+, not therapy.** Age gate in the UI and a database trigger. Crisis resources (988, National DV Hotline 1-800-799-7233) are one tap away and appear automatically when text suggests danger.

## Architecture

```
Browser (Next.js static export on GitHub Pages)
  ├─ Supabase Auth (email magic link, 6-digit code, or password)
  ├─ Supabase Postgres via RLS (acts as the signed-in user; anon key is public by design)
  ├─ Supabase Storage: private "couple-media" bucket, one folder per couple
  └─ Supabase Edge Functions (Deno), called with the user's own JWT:
       answers     encrypt/decrypt private onboarding answers
       checkins    monthly check-in submit, reveal, AI summary (Claude)
       date-ideas  five new date ideas (Claude) with a non-AI fallback
       buddy       Spark Buddy: chat, interview, go-between, opt-in shares (Claude only with consent)
```

- GitHub Pages serves static files only, so everything secret lives in Edge Function secrets: `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`. Nothing secret is in the browser bundle.
- Edge Functions never use the service role. They act with the caller's JWT, so RLS applies to them too.
- Claude model: `claude-sonnet-5-5`, structured JSON output, server-side refusal fallback enabled. Only the minimum data is sent (see the in-app "What's private" page).
- Encryption: AES-256-GCM with per-scope keys derived by HKDF from `ENCRYPTION_KEY` (`user:<id>` for private answers, `couple:<id>` for check-ins). Each ciphertext is bound to its row with associated data. The database rejects anything without the `v1.` ciphertext prefix.
- **Demo mode:** when `SUPABASE_URL`/`SUPABASE_ANON_KEY` are empty at build time, the app runs entirely in the browser with a fictional couple (Alex and Sam) and the same privacy rules. The public preview uses this.

## Spark Buddy, Projects and Money (2026-10-06, Thomas's request)

- **Spark Buddy** (`/us/buddy/`): each partner's private helper. It interviews you (20 starter questions, starting with the new "Where you come from" set: how you were raised, siblings, hometown, love language), fills each answer in from what you say or type (mic button where the browser supports it), and after each answer asks "Do you trust this to your Spark Buddy?". It coaches you about the relationship, reads your astrology and numbers, and proposes actions as cards you confirm: save an answer, put a date night on the shared calendar, send a note, add a project, record savings.
- **Go-between privacy model** (`supabase/functions/_shared/buddy.ts`): every answer has a level. *Off the table* (default) has no share row at all. *Hint* stores only words the author approved. *Open* stores the answer as the author saw it, and the sharing screen flags it when the answer later changes. The partner's Buddy only ever receives these shares plus data both already see (revealed check-ins, shared pulses, activities, calendar, projects, joint goals, goals made visible). Clearing or skipping an answer removes its share.
- **AI consent:** Buddy uses Claude only when the person turns AI on (asked once per device; enforced again on the server). With AI off, or with no key, Buddy runs its built-in rule-based guide, so the "never sent to AI" promise stays true by default. Crisis language always goes straight to resources, never to the model.
- **Projects** (`/plans/projects/`): one shared list ranked 1..N (move up/down, status, budget). **Money** (`/plans/money/`): savings goals, joint (both see and update) or yours (only you, unless you let your partner see it, read-only). Spark never connects to a bank.
- **Our stars & numbers** (`/us/stars/`): Sun sign, Chinese zodiac, Life Path and Personal Year for both partners, with couple strengths, watch-outs and "keep it from getting old" ideas. Computed deterministically (`_shared/astro.ts`); framed as a lens, not a prediction. Moon and Rising are not computed yet.
- **Buddy talks back (2026-10-07):** every reply is spoken in a lively voice (on by default; 🔊 Voice settings: talk back, hands-free, voice, energy, on-device-only). Tap 🎙 Talk: Buddy shows "I heard: …" live, sends when you pause (the GMM "own the turn" listener: it rides through the phone's early stop and ends on real silence), speaks the reply, asks interview questions aloud, and accepts spoken "yes, add it" / "off the table". Hands-free keeps listening after each reply until a turn is silent. Two engines: the device's own voice (always; the liveliest English voice is auto-picked, novelty voices excluded) and, in live mode with AI on, a studio voice from ElevenLabs (`eleven_v4`, voice Jade) rendered by the `buddy` Edge Function and metered per person per day (`20261007000500_spark_buddy_voice.sql`). If the studio voice fails mid-reply, the rest continues in the device voice. Code: `src/lib/buddy/voice/`, `src/components/buddy/use-buddy-voice.ts`, `supabase/functions/_shared/voice.ts`.
- **Rhythm Breaker (Module E, 2026-10-08):** Home "A little nudge" cards when a rut signal fires (same kinds of dates 3+ weeks, excitement dipping two weeks running, two weeks without time together, a big life change), each with specific actions and a per-person "Not now". Standing date nights at `/plans/standing/` (both see them, the setter pauses or removes, max 5) with an "Add to my calendar" weekly-repeat file. Life changes on Agreements raise the quick check-in rhythm one step for six weeks. Migration `20261008000600_spark_rhythm_breaker.sql`; code `src/lib/domain/{date-rules,rhythm-breaker}.ts`.
- **Migrations:** `20261006000300_spark_buddy.sql` (buddy_shares, buddy_messages, date_plans) and `20261006000400_spark_projects_money.sql` (projects + `move_project`, money_goals). Both are covered by `tests/db/buddy-projects-money.test.ts`.

## Project layout

```
src/app/                 routes (all static)
src/components/          UI primitives, app shell, providers, feature components
src/lib/domain/          pure logic: cadence math, rhythm triggers, dates, social agreement, themes
src/lib/backend/         the Backend contract (types.ts) + live/ (Supabase) + demo/ (in-browser)
supabase/migrations/     schema, RLS policies, RPCs, storage policies
supabase/functions/      Edge Functions; _shared/ holds logic shared with the app and tests
scripts/seed.ts          two paired test accounts + sample shared data
tests/unit/              domain, crypto, contrast, module tests
tests/functions/         Edge Function handler tests (fake Claude, in-memory repos)
tests/db/                migrations + privacy tests on an in-process Postgres (PGlite)
```

## Run it locally (demo mode, no accounts needed)

```bash
npm install
npm run dev          # http://localhost:3000, demo mode
npm test             # all tests, including the RLS privacy test
npm run build        # static export into out/
```

## Connect a real Supabase project (live mode)

1. Create a project at supabase.com. Copy the project URL, anon key and service role key.
2. Create `.env.local` from `.env.example` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Link and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
4. Set Edge Function secrets and deploy the functions:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> ENCRYPTION_KEY
   npx supabase secrets set ENCRYPTION_KEY=<that value> ANTHROPIC_API_KEY=<your key> ALLOWED_ORIGINS=https://<user>.github.io,http://localhost:3000
   npx supabase secrets set ELEVENLABS_API_KEY=<your key>   # optional: Buddy's studio voice
   npx supabase functions deploy answers
   npx supabase functions deploy checkins
   npx supabase functions deploy date-ideas
   npx supabase functions deploy buddy
   ```
   Back up `ENCRYPTION_KEY` in a password manager. Losing it makes existing encrypted answers unreadable.
5. Auth settings (Dashboard > Authentication > URL Configuration): Site URL `https://<user>.github.io/spark/`, and add redirect URLs `https://<user>.github.io/spark/auth/callback/` and `http://localhost:3000/auth/callback/`.
6. Email template (Authentication > Email Templates > Magic Link): include `{{ .Token }}` so people can type the 6-digit code when the link opens in a different browser.
7. Seed two test accounts: `npm run seed` (prints the emails and a password).
8. Run `npm run dev` with `.env.local`, or publish (below) with the URL and anon key as GitHub repository variables.

## Tests

| Suite | What it proves |
|---|---|
| `tests/db/privacy.test.ts` | Partner A cannot read, count, update, delete or forge partner B's private answers; check-in answers and pulse scores stay hidden until both submit; outsiders and signed-out visitors see nothing; pairing rules; storage folder isolation. Runs the real migrations on PGlite. |
| `tests/unit/cadence.test.ts` | Cadence negotiation (daily + monthly = weekly, weekly + monthly = biweekly, symmetry, bounds), life-change boost, due dates, quarterly review. |
| `tests/unit/rhythm.test.ts`, `tests/unit/home-rhythm.test.tsx` | Pace votes move the rhythm only when both agree and never leak before reveal; quick check-in due dates; the check-in pop-up and Not now; Home shows favorites and no bottom-bar repeats. |
| `tests/unit/triggers.test.ts` | Rhythm trigger logic: category rut, excitement dropping two weeks running, little time together, life change, and the supportive suggestions they map to. |
| `tests/unit/crypto.test.ts` | Encryption round trip, fresh IVs, wrong scope/row/key rejected, tamper detection, no plaintext in errors. |
| `tests/unit/domain.test.ts` | Dates and anniversaries, social agreement (always the more private choice), WCAG AA contrast for every theme, crisis detection, questionnaire rules. |
| `tests/db/buddy-projects-money.test.ts` | Buddy shares readable by the partner only and never writable by them, no "private" share level exists, conversations owner-only, shared calendar and projects couple-only, `move_project` ordering, private savings goals invisible unless shared and never editable by the partner, goal owner/type frozen. |
| `tests/unit/buddy.test.ts`, `tests/functions/buddy.test.ts`, `tests/unit/buddy-demo.test.ts`, `tests/unit/buddy-screens.test.tsx` | Astrology/numerology math, interview answer interpretation, go-between replies built only from shares, action validation, Claude only with consent, crisis bypass, encrypted chat, the demo scenario end to end, and the screens. |
| `tests/functions/*` and module tests | Edge Function handlers with a fake Claude: encryption on save, reveal rules, summary once, fallback paths, five non-repeating date ideas, rate limits. |

## Publish to GitHub Pages

The `Deploy to GitHub Pages` workflow tests, builds and publishes on every push to `main`. Without repository variables it builds demo mode. To build live mode, set repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (never the service role, Anthropic or encryption keys).

## Environment variables

See [.env.example](.env.example). Browser-safe: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BASE_PATH`. Server-only: `SUPABASE_SERVICE_ROLE_KEY` (seed script only), `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`, `ALLOWED_ORIGINS`. Stripe keys arrive with billing in Phase 4.

## Acceptance checklist (Phase 1)

- Two test accounts can pair (invite code or link).
- Each completes the light onboarding privately (answers encrypted; partner can never read them).
- Monthly check-in answers stay hidden until both submit, then appear side by side with a summary.
- A couple can log an activity and rate it.
- A couple can get five new date ideas.
- The privacy test passes (`npm run test:privacy`).
