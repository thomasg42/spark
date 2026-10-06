export const ACTIVITY_CATEGORIES = ["food", "outdoors", "adventure", "creative", "chill", "social", "active"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const CATEGORY_COPY: Record<ActivityCategory, { label: string; emoji: string }> = {
  food: { label: "Food", emoji: "🍜" },
  outdoors: { label: "Outdoors", emoji: "🌲" },
  adventure: { label: "Adventure", emoji: "🧭" },
  creative: { label: "Creative", emoji: "🎨" },
  chill: { label: "Chill", emoji: "🛋️" },
  social: { label: "Social", emoji: "🎉" },
  active: { label: "Active", emoji: "🚴" },
};

export function isActivityCategory(value: unknown): value is ActivityCategory {
  return typeof value === "string" && (ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}

export const STORY_KINDS = [
  "how_we_met", "together", "first_date", "first_kiss", "met_family", "trip", "milestone", "anniversary", "other",
] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

export const STORY_KIND_COPY: Record<StoryKind, { label: string; emoji: string; prompt: string }> = {
  how_we_met: { label: "How we met", emoji: "✨", prompt: "Where were you, and what do you each remember?" },
  together: { label: "Officially together", emoji: "💞", prompt: "The day you decided. How did it happen?" },
  first_date: { label: "First date", emoji: "🍽️", prompt: "Where did you go? What almost went wrong?" },
  first_kiss: { label: "First kiss", emoji: "💋", prompt: "Only as much detail as you both want here." },
  met_family: { label: "Met the family", emoji: "🏡", prompt: "Whose family, and how did it go?" },
  trip: { label: "Trip", emoji: "🧳", prompt: "Where to, and the moment you'd relive?" },
  milestone: { label: "Milestone", emoji: "🏁", prompt: "Moved in, new pet, big win…" },
  anniversary: { label: "Anniversary", emoji: "🎂", prompt: "A date worth celebrating every year." },
  other: { label: "Something else", emoji: "📌", prompt: "Anything worth remembering together." },
};
