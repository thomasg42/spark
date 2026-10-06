# Spark roadmap

Phase 1 is built (see README). This is the plan for the rest, in order. Each phase keeps the non-negotiable principles: no tracking, private answers stay private, consent first, no manipulation, 18+, not therapy.

## Phase 2: Rhythm and goals

- **Rhythm Breaker engine.** The trigger logic already exists and is unit tested (`src/lib/domain/triggers.ts`): category rut (same categories 3+ weeks), excitement dropping two weeks running, little time together, life changes. Phase 2 adds the UI cards, dismiss/snooze, and tailored actions (new category, surprise, tech-free night) fed by these signals.
- **Standing date rule with reminders.** For example "every Wednesday 6 to 9 PM: date night, then we each go home." Table `date_rules`, a calendar (.ics) export, and in-app reminders (push arrives in Phase 4).
- **Life change log.** Table `life_changes` (new job, new schedule, move). The cadence math already raises the check-in rhythm one rung for six weeks (`coupleCadence`).
- **Goals and Projects.** Trip planner with a savings tracker (target, saved, contributions), dream list, marriage/kids/home timelines, and a joint monthly "state of us" review. Progress bars, gentle nudges, no pressure.
- **Second questionnaire (after month 1).** Pace, time together, attaching too much / too little / just right, what you want more of.
- **Family & friends questionnaire.** The spec lists it in Module B but did not assign it to a phase; placed here. Who you've met, each person's opinion, whether concerns are fixable, suggested actions.

## Phase 3: Talking and hints

- **Counselor Mode (private).** Voice input with the Web Speech API and a server-side transcription fallback. Calm, balanced coach: reflects feelings, one good question at a time, two or three practical options, de-escalates. Never diagnoses, never encourages tracking, retaliation or ultimatums, always notes it is not therapy. Crisis detection (`mentionsCrisis`) already exists and shows resources immediately. History private and deletable.
- **Hints and pattern cards (opt-in, confidential).** For each sensitive answer: share nothing, a generalized hint, or a hint only when a trigger fires (trip or long work stretch, excitement drops, "feeling distant" flag). Hints are written as supportive advice without revealing the source. The answerer writes or approves every hint before it can ever be shown.
- **Intimacy, History and Health modules** behind a plain-language confidentiality screen with a checkbox acknowledgement before the first question. Private by default, skippable, "talk to a professional" resources.

## Phase 4: Reflection, install, billing, data rights

- **Astrology and Numerology (for reflection and fun, not prediction).** Deterministic computation with a library (astronomy-engine or Swiss Ephemeris): Sun sign, Chinese zodiac, Life Path number; Moon and Rising only with birth time and place. The AI may only narrate computed values. Birth time and place are already collected (optional) on the profile.
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
