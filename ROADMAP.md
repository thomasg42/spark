# Spark roadmap

Phase 1 is built (see README). This is the plan for the rest, in order. Each phase keeps the non-negotiable principles: no tracking, private answers stay private, consent first, no manipulation, 18+, not therapy.

## Phase 2: Rhythm and goals

- **Rhythm Breaker engine. BUILT 2026-10-08.** Home "A little nudge" cards from the tested signals (`src/lib/domain/rhythm-breaker.ts`), at most two, each with one or two specific actions, "Not now" for a week per person, stale dips ignored.
- **Standing date rule with reminders. BUILT 2026-10-08.** `/plans/standing/`, table `date_rules` (migration `0600`), weekly-repeat calendar file with a one-hour reminder. Still to do: in-app push reminders (Phase 4).
- **Life change log. BUILT 2026-10-08.** Table `life_changes`, card on Agreements; raises the quick check-in rhythm one step for six weeks (`agreedRhythm`).
- **Goals and Projects.** Built 2026-10-06 (Projects ranked list, Money savings goals, shared calendar). Still to do: contribution history per goal, dream list, marriage/kids/home timelines, and a joint monthly "state of us" review.
- **Spark Buddy follow-ups.** Sync the AI-consent choice across devices (a `profiles.buddy_ai` column; today it is per device and defaults off), push reminders for Buddy-booked dates, and trigger-based hints (show a hint only when a Rhythm Breaker signal fires).
- **Second questionnaire (after month 1).** Pace, time together, attaching too much / too little / just right, what you want more of.
- **Family & friends questionnaire.** The spec lists it in Module B but did not assign it to a phase; placed here. Who you've met, each person's opinion, whether concerns are fixable, suggested actions.

- **Persist the living rhythm server-side.** Today the rhythm is recomputed from revealed check-in votes (one decrypting read per revealed month per session). A small migration adding `couples.rhythm` (set by the checkins function at reveal) removes that cost.
- **Sub-monthly deep check-ins (Thomas, 2026-10-06).** If a couple votes their way to weekly, the full five-question check-in could follow that pace too. Needs a migration: `checkins.period` is month-keyed (`YYYY-MM`). Until then the agreed pace drives the quick check-in, and the deep check-in stays monthly.
- **Favorites across devices.** Home favorites are saved per person on each device. A `profiles.home_favorites` column would sync them.

## Phase 3: Talking and hints

- **Counselor Mode (private).** Voice input with the Web Speech API and a server-side transcription fallback. Calm, balanced coach: reflects feelings, one good question at a time, two or three practical options, de-escalates. Never diagnoses, never encourages tracking, retaliation or ultimatums, always notes it is not therapy. Crisis detection (`mentionsCrisis`) already exists and shows resources immediately. History private and deletable.
- **Hints and pattern cards. BUILT 2026-10-08 (Module H, migration `0700`).** `/us/hints/`: answer to unlock (a partner's share shows only after you answer the same question; teasers say what's waiting), moment-only hints (apart / excitement dips / "I'm feeling a bit distant" flag), pattern cards from open shares. Original spec text, now done: For each sensitive answer: share nothing, a generalized hint, or a hint only when a trigger fires (trip or long work stretch, excitement drops, "feeling distant" flag). Hints are written as supportive advice without revealing the source. The answerer writes or approves every hint before it can ever be shown.
- **Intimacy, History and Health modules** behind a plain-language confidentiality screen with a checkbox acknowledgement before the first question. Private by default, skippable, "talk to a professional" resources.

## Phase 4: Reflection, install, billing, data rights

- **Astrology and Numerology (for reflection and fun, not prediction).** Sun sign, Chinese zodiac, Life Path and Personal Year shipped early (2026-10-06, `/us/stars/`). Remaining: Deterministic computation with a library (astronomy-engine or Swiss Ephemeris): Sun sign, Chinese zodiac, Life Path number; Moon and Rising only with birth time and place. The AI may only narrate computed values. Birth time and place are already collected (optional) on the profile.
- **PWA install and notifications.** Service worker, offline shell, web push for check-in reminders and partner moments. Share-sheet target so a clip from another app can be sent straight into Moments (Thomas's request, 2026-10-06).
- **Stripe billing.** Free trial, then $5/month per couple (spec). The price and trial length are Thomas's decisions to confirm before launch.
- **Export and delete tools.** Either partner can export all of their own data (decrypted, JSON + media) and permanently delete it at any time. The schema already cascades a user's private rows on account deletion; shared content they authored is kept for the partner with the author cleared. Confirm that policy with Thomas before shipping.
- **Accessibility and polish.** Full screen-reader pass, reduced-motion review, localization groundwork.

## Known Phase 1 limitations

- **Working name.** "Spark" is a working name; final naming is Thomas's decision.
- **Supabase project.** Live mode needs a Supabase project, secrets and deployed functions (README steps). The public preview runs in demo mode until then.
- **Encryption key rotation.** Ciphertexts carry a `v1.` version. Rotation needs a re-encryption job (decrypt with old key, encrypt with new) before the old key is retired.
- **Edge Function type-check.** Deno checks run in CI (`check-functions.yml`). The handlers' logic is unit tested in Node with a fake Claude client.
- **Invite brute force.** Codes are 8 characters from a 31-character alphabet, single use, 7-day expiry, sign-in required. Add rate limiting on `join_couple` if abuse appears.
