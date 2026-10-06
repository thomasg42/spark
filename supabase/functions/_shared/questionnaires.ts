/**
 * Module B: onboarding questionnaires (month 1, light and laid-back).
 *
 * Every answer is PRIVATE: only the person who wrote it can ever read it. In
 * Phase 1 nothing from these answers is shown to the partner in any form. Phase 3
 * adds opt-in hints that the answerer writes and approves.
 *
 * Each section is split into short sittings (5 to 8 questions), progress saves
 * after every answer, and every question can be skipped.
 */

export type QuestionKind = "text" | "single" | "multi" | "scale";

interface BaseQuestion {
  id: string;
  prompt: string;
  help?: string;
  optional?: true; // every question is skippable; this flags extra-gentle ones
}
export interface TextQuestion extends BaseQuestion {
  kind: "text";
  placeholder?: string;
  long?: boolean;
}
export interface Option {
  value: string;
  label: string;
}
export interface SingleQuestion extends BaseQuestion {
  kind: "single";
  options: Option[];
}
export interface MultiQuestion extends BaseQuestion {
  kind: "multi";
  options: Option[];
  max?: number;
}
export interface ScaleQuestion extends BaseQuestion {
  kind: "scale";
  minLabel: string;
  maxLabel: string;
}
export type Question = TextQuestion | SingleQuestion | MultiQuestion | ScaleQuestion;
export type AnswerValue = string | string[] | number;

export interface Sitting {
  id: string;
  title: string;
  questions: Question[];
}

export interface Section {
  key: string;
  title: string;
  emoji: string;
  blurb: string;
  phase: 1 | 2 | 3;
  sittings: Sitting[];
}

const o = (value: string, label: string): Option => ({ value, label });

export const TEXT_ANSWER_MAX = 2000;

export const SECTIONS: Section[] = [
  {
    key: "beginnings",
    title: "Beginnings",
    emoji: "🌱",
    blurb: "How it started, in your own words. Light, warm, and just for you.",
    phase: 1,
    sittings: [
      {
        id: "beginnings_1",
        title: "The spark",
        questions: [
          { id: "how_we_met_mine", kind: "text", prompt: "How did you two meet? Tell it your way.", placeholder: "Where, when, and what you noticed first…", long: true },
          { id: "what_attracted_you", kind: "text", prompt: "What attracted you to them at first?", placeholder: "Their laugh, how they listened, the way they…" },
          { id: "wanted_more_time", kind: "text", prompt: "What made you want to keep spending time together?" },
          { id: "first_this_could_be", kind: "text", prompt: "When did you first think, \"this could be something\"?" },
          { id: "early_small_thing", kind: "text", prompt: "A small thing they did early on that you still remember." },
        ],
      },
      {
        id: "beginnings_2",
        title: "Getting closer",
        questions: [
          {
            id: "met_through",
            kind: "single",
            prompt: "How did you meet?",
            options: [o("work", "Through work"), o("friends", "Through friends"), o("online", "Online or an app"), o("school", "School"), o("chance", "By chance"), o("other", "Something else")],
          },
          {
            id: "met_through_feeling",
            kind: "scale",
            prompt: "Looking back, how do you feel about how you met?",
            help: "For example, whether dating a coworker or a friend-of-a-friend has been easy or tricky.",
            minLabel: "It's been tricky",
            maxLabel: "Glad it happened that way",
          },
          { id: "met_through_why", kind: "text", prompt: "Why do you feel that way about how you met?", placeholder: "What's been easy, what's been awkward…" },
          {
            id: "comfortable_getting_close",
            kind: "text",
            prompt: "What helped you feel comfortable getting close, emotionally or physically?",
            help: "Answer only as much as you want. Skipping is completely fine.",
            optional: true,
          },
          { id: "favorite_early_memory", kind: "text", prompt: "Your favorite memory from the first few months?" },
          { id: "proud_of_us", kind: "text", prompt: "What are you proud of about how you two started?" },
        ],
      },
    ],
  },
  {
    key: "closeness_trust",
    title: "Closeness & trust",
    emoji: "🤝",
    blurb: "What helps you feel safe and close, and what makes it harder.",
    phase: 1,
    sittings: [
      {
        id: "closeness_trust_1",
        title: "Feeling safe",
        questions: [
          { id: "safe_when_apart", kind: "scale", prompt: "When you're apart, how safe and settled do you feel about us?", minLabel: "Uneasy", maxLabel: "Completely settled" },
          {
            id: "contact_needs",
            kind: "single",
            prompt: "When you're apart, what kind of contact feels right?",
            options: [
              o("lots", "Lots of little messages through the day"),
              o("key_moments", "Check-ins at key moments (morning, night, plans changing)"),
              o("space", "Plenty of space, then catch up later"),
              o("depends", "It depends on the day"),
            ],
          },
          { id: "trust_level", kind: "scale", prompt: "How would you describe your trust level right now?", minLabel: "Still building", maxLabel: "Rock solid" },
          {
            id: "trust_helps",
            kind: "multi",
            prompt: "What helps you trust?",
            options: [
              o("follow_through", "Doing what they said they'd do"),
              o("plans_shared", "Knowing the plan, and hearing when it changes"),
              o("honesty", "Honesty, even when it's awkward"),
              o("consistency", "Being the same person in private and in public"),
              o("introductions", "Being included with friends and family"),
              o("reassurance", "Hearing it out loud now and then"),
            ],
          },
          { id: "trust_helps_more", kind: "text", prompt: "Anything else that helps you trust?" },
        ],
      },
      {
        id: "closeness_trust_2",
        title: "What hurts, what heals",
        questions: [
          { id: "trust_hurts", kind: "text", prompt: "What tends to shake your trust, even a little?", help: "This stays private. Phase 3 lets you choose to share a gentle hint if you ever want to." },
          {
            id: "reassurance_style",
            kind: "multi",
            prompt: "When you need reassurance, what lands best?",
            options: [o("words", "Words"), o("time", "Time together"), o("touch", "Touch"), o("plans", "Making plans"), o("actions", "Small helpful actions"), o("space", "A little space first")],
          },
          {
            id: "social_media_feelings",
            kind: "single",
            prompt: "How do you feel about our relationship showing up on social media?",
            help: "Private feelings here. You can set an open couple agreement in Settings.",
            options: [
              o("prefer_private", "I'd rather keep us off social media"),
              o("status_ok", "A relationship status is enough"),
              o("milestones_ok", "Big moments are nice to share"),
              o("love_sharing", "I love sharing us"),
              o("unsure", "Not sure yet"),
            ],
          },
          { id: "social_media_why", kind: "text", prompt: "What's behind that feeling?", placeholder: "Privacy, family, past experiences, fun…" },
          { id: "feel_close_when", kind: "text", prompt: "You feel closest to them when…" },
          { id: "trust_one_thing", kind: "text", prompt: "One thing that would make you feel even more secure in us." },
        ],
      },
    ],
  },
  {
    key: "attachment",
    title: "When things get hard",
    emoji: "🌊",
    blurb: "How you react under stress and what helps you reset. No right answers.",
    phase: 1,
    sittings: [
      {
        id: "attachment_1",
        title: "Your pattern",
        questions: [
          {
            id: "conflict_tendency",
            kind: "single",
            prompt: "When things get hard between you, you tend to…",
            options: [
              o("pull_away", "Pull away to think"),
              o("pursue", "Pursue, I want to resolve it now"),
              o("shut_down", "Shut down or go quiet"),
              o("escalate", "Get heated"),
              o("depends", "It depends"),
            ],
          },
          {
            id: "reset_helps",
            kind: "multi",
            prompt: "What helps you reset?",
            options: [
              o("alone_time", "Time alone"),
              o("walk", "A walk or movement"),
              o("talk_now", "Talking it through right away"),
              o("hug", "A hug"),
              o("write", "Writing it down"),
              o("sleep", "Sleeping on it"),
              o("distraction", "A distraction, then talk"),
            ],
          },
          {
            id: "reset_time",
            kind: "single",
            prompt: "Usually, how long do you need before you're ready to talk?",
            options: [o("minutes", "A few minutes"), o("hour", "An hour or so"), o("evening", "An evening"), o("day", "A day or more")],
          },
          { id: "dont_take_personally", kind: "text", prompt: "When you pull away, what should your partner NOT take personally?", placeholder: "It usually means I'm… It doesn't mean…" },
          { id: "ready_signal", kind: "text", prompt: "What's a small sign that you're ready to reconnect?" },
        ],
      },
      {
        id: "attachment_2",
        title: "Repair",
        questions: [
          { id: "after_conflict_need", kind: "text", prompt: "After a disagreement, what do you need from them?" },
          { id: "repair_gesture", kind: "text", prompt: "What's a repair gesture that really works on you?", placeholder: "A joke, a coffee, an apology with specifics…" },
          { id: "learned_from_past", kind: "text", prompt: "Something you've learned about yourself in past conflicts." },
          {
            id: "stress_outside",
            kind: "single",
            prompt: "When outside stress hits (work, money, family), you usually want…",
            options: [o("help", "Help solving it"), o("listen", "Just to be heard"), o("distract", "A distraction"), o("space", "Some space")],
          },
          { id: "argue_well", kind: "scale", prompt: "How well do you two handle disagreements right now?", minLabel: "Rough", maxLabel: "Really well" },
        ],
      },
    ],
  },
  {
    key: "direction",
    title: "Direction",
    emoji: "🧭",
    blurb: "Where you hope this goes. Feelings, not promises.",
    phase: 1,
    sittings: [
      {
        id: "direction_1",
        title: "The big picture",
        questions: [
          {
            id: "long_term",
            kind: "single",
            prompt: "Right now, how do you see this relationship?",
            options: [o("long_term", "Building something long-term"), o("seeing", "Seeing where it goes"), o("unsure", "Not sure yet")],
          },
          {
            id: "marriage_feelings",
            kind: "single",
            prompt: "How do you feel about marriage, for you?",
            options: [o("want", "I want it someday"), o("open", "Open to it"), o("not_for_me", "Not for me"), o("unsure", "Not sure")],
          },
          {
            id: "kids_feelings",
            kind: "single",
            prompt: "How do you feel about kids?",
            options: [o("want", "I want kids"), o("have", "I already have kids"), o("open", "Open to it"), o("dont_want", "I don't want kids"), o("unsure", "Not sure")],
          },
          { id: "timing_thoughts", kind: "text", prompt: "Any thoughts on timing for the big steps?", placeholder: "Moving in, marriage, kids… or 'no rush'." },
          { id: "five_years", kind: "text", prompt: "Picture five years from now on a good day. What does it look like?", long: true },
        ],
      },
      {
        id: "direction_2",
        title: "Building a life",
        questions: [
          {
            id: "living",
            kind: "single",
            prompt: "Living together:",
            options: [o("already", "We already do"), o("soon", "Soon would be nice"), o("someday", "Someday"), o("not_now", "Not for now"), o("unsure", "Not sure")],
          },
          {
            id: "money_style",
            kind: "single",
            prompt: "How would you like to handle money as a couple, eventually?",
            options: [o("shared", "Fully shared"), o("partly", "Partly shared, partly separate"), o("separate", "Separate"), o("unsure", "Not sure yet")],
          },
          {
            id: "home_life_plan",
            kind: "single",
            prompt: "How do you picture sharing work, home, and care over the years?",
            help: "This is about a shared plan with mutual support. One partner focusing more on home for a season is one option among many, never an expectation.",
            options: [
              o("equal", "Both working and sharing home life evenly"),
              o("seasonal_focus", "One of us focusing more on home for a season, with full support from the other"),
              o("flexible", "Flexible, depending on the season of life"),
              o("unsure", "Not sure yet"),
            ],
          },
          { id: "career_hopes", kind: "text", prompt: "What do you hope for in your career, and how can your partner support it?" },
          { id: "where_to_live", kind: "text", prompt: "Where would you love to live, someday?" },
          { id: "non_negotiable", kind: "text", prompt: "Something about the future that really matters to you.", help: "Private. It just helps you get clear." },
        ],
      },
    ],
  },
];

/** Sections planned for later phases, shown as "coming later" in the app. */
export const LATER_SECTIONS: Array<{ key: string; title: string; emoji: string; phase: 2 | 3; note: string }> = [
  { key: "family_friends", title: "Family & friends", emoji: "🏡", phase: 2, note: "Who you've met, how it's going, and what might help." },
  { key: "intimacy", title: "Intimacy", emoji: "🕯️", phase: 3, note: "Private by default, with a confidentiality screen first." },
  { key: "history", title: "History", emoji: "📖", phase: 3, note: "Strictly optional, confidential, never shown raw." },
  { key: "health", title: "Health reminders", emoji: "🩺", phase: 3, note: "Gentle, private reminders framed as care." },
];

export function findSection(key: string): Section | undefined {
  return SECTIONS.find((s) => s.key === key);
}

export function findQuestion(questionId: string): { section: Section; sitting: Sitting; question: Question } | undefined {
  for (const section of SECTIONS) {
    for (const sitting of section.sittings) {
      const question = sitting.questions.find((q) => q.id === questionId);
      if (question) return { section, sitting, question };
    }
  }
  return undefined;
}

/** Validates an answer against its question definition. Returns the normalized value. */
export function validateAnswer(question: Question, value: unknown): AnswerValue {
  switch (question.kind) {
    case "text": {
      if (typeof value !== "string") throw new Error("Expected text.");
      const text = value.trim();
      if (!text) throw new Error("Answer is empty. Use skip instead.");
      if (text.length > TEXT_ANSWER_MAX) throw new Error("Answer is too long.");
      return text;
    }
    case "single": {
      if (typeof value !== "string" || !question.options.some((opt) => opt.value === value)) throw new Error("Pick one of the options.");
      return value;
    }
    case "multi": {
      if (!Array.isArray(value) || value.length === 0) throw new Error("Pick at least one option.");
      const unique = [...new Set(value)];
      if (!unique.every((v) => typeof v === "string" && question.options.some((opt) => opt.value === v))) throw new Error("Unknown option.");
      if (question.max && unique.length > question.max) throw new Error(`Pick up to ${question.max}.`);
      return unique as string[];
    }
    case "scale": {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) throw new Error("Pick 1 to 5.");
      return value;
    }
  }
}

export interface SectionProgress {
  answered: number;
  skipped: number;
  total: number;
  done: boolean;
  nextSittingIndex: number; // first sitting with anything left, or sittings.length when done
}

export function sectionProgress(section: Section, saved: Record<string, { skipped: boolean }>): SectionProgress {
  let answered = 0;
  let skipped = 0;
  let total = 0;
  let nextSittingIndex = section.sittings.length;
  section.sittings.forEach((sitting, index) => {
    let sittingDone = true;
    for (const q of sitting.questions) {
      total += 1;
      const s = saved[q.id];
      if (!s) sittingDone = false;
      else if (s.skipped) skipped += 1;
      else answered += 1;
    }
    if (!sittingDone && nextSittingIndex === section.sittings.length) nextSittingIndex = index;
  });
  return { answered, skipped, total, done: answered + skipped === total, nextSittingIndex };
}
