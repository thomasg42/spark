/**
 * Astrology and numerology for Spark Buddy, computed deterministically from the
 * birthdays already on each profile. The AI may only narrate these computed
 * values; it never invents a placement.
 *
 * Framing (shown wherever this appears): a lens for conversation and for
 * noticing what to watch for, not a prediction or a verdict on the couple.
 *
 * Computed here: Sun sign (with a cusp flag), element, modality, Chinese zodiac
 * animal (flagged when the birthday falls in the Lunar New Year window), Life
 * Path number, and this year's Personal Year number. Moon and Rising need an
 * ephemeris plus birth time and place, so they are left for a later phase.
 */

export const ASTRO_FRAMING =
  "Astrology and numerology here are a lens for conversation and for noticing what to watch for, not a prediction. Keep what rings true.";

export type Element = "fire" | "earth" | "air" | "water";
export type Modality = "cardinal" | "fixed" | "mutable";

export interface SunSign {
  key: string;
  name: string;
  symbol: string;
  element: Element;
  modality: Modality;
  traits: string;
  /** Inclusive start, as [month, day]. */
  start: [number, number];
}

export const SUN_SIGNS: SunSign[] = [
  { key: "capricorn", name: "Capricorn", symbol: "♑", element: "earth", modality: "cardinal", traits: "steady, ambitious, quietly loyal", start: [12, 22] },
  { key: "aquarius", name: "Aquarius", symbol: "♒", element: "air", modality: "fixed", traits: "independent, original, needs room to think", start: [1, 20] },
  { key: "pisces", name: "Pisces", symbol: "♓", element: "water", modality: "mutable", traits: "tender, imaginative, absorbs the mood of the room", start: [2, 19] },
  { key: "aries", name: "Aries", symbol: "♈", element: "fire", modality: "cardinal", traits: "bold, direct, quick to start", start: [3, 21] },
  { key: "taurus", name: "Taurus", symbol: "♉", element: "earth", modality: "fixed", traits: "sensual, patient, loves comfort and routine", start: [4, 20] },
  { key: "gemini", name: "Gemini", symbol: "♊", element: "air", modality: "mutable", traits: "curious, talkative, bored by sameness", start: [5, 21] },
  { key: "cancer", name: "Cancer", symbol: "♋", element: "water", modality: "cardinal", traits: "caring, protective, feels things deeply", start: [6, 21] },
  { key: "leo", name: "Leo", symbol: "♌", element: "fire", modality: "fixed", traits: "warm, generous, loves to be appreciated", start: [7, 23] },
  { key: "virgo", name: "Virgo", symbol: "♍", element: "earth", modality: "mutable", traits: "thoughtful, helpful, notices the details", start: [8, 23] },
  { key: "libra", name: "Libra", symbol: "♎", element: "air", modality: "cardinal", traits: "charming, fair-minded, wants harmony", start: [9, 23] },
  { key: "scorpio", name: "Scorpio", symbol: "♏", element: "water", modality: "fixed", traits: "intense, private, all-in when they trust", start: [10, 23] },
  { key: "sagittarius", name: "Sagittarius", symbol: "♐", element: "fire", modality: "mutable", traits: "adventurous, honest, needs freedom", start: [11, 22] },
];

export const ELEMENT_COPY: Record<Element, { label: string; emoji: string; needs: string }> = {
  fire: { label: "Fire", emoji: "🔥", needs: "excitement, spontaneity and being admired" },
  earth: { label: "Earth", emoji: "🌿", needs: "consistency, follow-through and real-world care" },
  air: { label: "Air", emoji: "🌬️", needs: "conversation, novelty and room to think" },
  water: { label: "Water", emoji: "🌊", needs: "emotional closeness, reassurance and depth" },
};

export interface PairingNote {
  strength: string;
  watchOut: string;
  keepItFresh: string;
}

/** Keyed by the two elements in alphabetical order, joined with "+". */
const ELEMENT_PAIRS: Record<string, PairingNote> = {
  "fire+fire": {
    strength: "Big energy, lots of fun, and a shared appetite for adventure.",
    watchOut: "Two strong wills can turn small sparks into fires. Arguments flare fast and pride makes repair slow.",
    keepItFresh: "Keep a steady supply of new experiences, and agree on a cool-down word before things heat up.",
  },
  "earth+earth": {
    strength: "Reliable, loyal and building something real together.",
    watchOut: "Comfort can slide into routine. The relationship can start to feel like a well-run household instead of a romance.",
    keepItFresh: "Schedule the unscheduled: one new place or new thing each month, on the calendar so it actually happens.",
  },
  "air+air": {
    strength: "Endless conversation, shared ideas and a lot of laughing.",
    watchOut: "It can stay in the head. Feelings get talked about instead of felt, and plans stay ideas.",
    keepItFresh: "Turn talk into action: pick one idea from your conversations each month and actually do it.",
  },
  "water+water": {
    strength: "Deep emotional understanding, often without words.",
    watchOut: "Moods can feed each other. When one sinks, both can, and hurt feelings may go unspoken.",
    keepItFresh: "Name feelings out loud early, and plan light, playful dates to balance the depth.",
  },
  "earth+fire": {
    strength: "Fire brings spark and courage; Earth brings stability and follow-through.",
    watchOut: "Pace mismatch. Fire can feel held back, Earth can feel rushed or taken for granted.",
    keepItFresh: "Alternate who picks the plan: one spontaneous adventure, then one cozy, planned night.",
  },
  "air+fire": {
    strength: "A naturally lively pair: ideas fuel action and action fuels ideas.",
    watchOut: "All spark, little grounding. Practical things and quiet emotional check-ins can get skipped.",
    keepItFresh: "Keep the novelty, and add a slow, phone-free evening now and then just to talk about how you feel.",
  },
  "fire+water": {
    strength: "Passion and depth. Fire warms Water, Water softens Fire.",
    watchOut: "Fire's bluntness can wound Water, and Water's withdrawal can frustrate Fire. Steam builds when it isn't talked about.",
    keepItFresh: "Fire: lead with tenderness. Water: say what you need instead of waiting to be noticed. Mix bold dates with cozy ones.",
  },
  "air+earth": {
    strength: "Air brings new ideas, Earth makes them real.",
    watchOut: "Earth can find Air flighty; Air can find Earth stubborn or dull. Misread motives are the risk.",
    keepItFresh: "Let Air plan the surprise and Earth plan the logistics. Try one new thing in a familiar setting.",
  },
  "earth+water": {
    strength: "A nurturing, secure match: Earth protects, Water deepens.",
    watchOut: "Both can avoid hard conversations to keep the peace, and comfort can turn into a rut.",
    keepItFresh: "Gently push past comfort: a weekend trip, a class together, or a new ritual you both look forward to.",
  },
  "air+water": {
    strength: "Head and heart: Air brings perspective, Water brings feeling.",
    watchOut: "Air can seem detached when Water needs closeness; Water can feel overwhelming when Air needs space.",
    keepItFresh: "Air: show up for the feelings, not just the facts. Water: give room without reading it as rejection.",
  },
};

export const SAME_SIGN_NOTE =
  "Same Sun sign: you understand each other's instincts, and you may share the same blind spots. Notice the patterns you both fall into.";

export interface ChineseZodiac {
  animal: string;
  emoji: string;
  /** True when the birthday falls in the Lunar New Year window, so it could be the previous animal. */
  uncertain: boolean;
  alternate: string | null;
}

const ANIMALS: Array<[string, string]> = [
  ["Rat", "🐀"], ["Ox", "🐂"], ["Tiger", "🐅"], ["Rabbit", "🐇"], ["Dragon", "🐉"], ["Snake", "🐍"],
  ["Horse", "🐎"], ["Goat", "🐐"], ["Monkey", "🐒"], ["Rooster", "🐓"], ["Dog", "🐕"], ["Pig", "🐖"],
];

export const LIFE_PATH_COPY: Record<number, { title: string; gift: string; watchOut: string }> = {
  1: { title: "The Leader", gift: "drive, independence and courage", watchOut: "can steamroll or struggle to ask for help" },
  2: { title: "The Partner", gift: "sensitivity, patience and harmony", watchOut: "can swallow their needs to keep the peace" },
  3: { title: "The Communicator", gift: "joy, creativity and expression", watchOut: "can scatter energy or deflect with humor" },
  4: { title: "The Builder", gift: "loyalty, structure and hard work", watchOut: "can get rigid or forget to play" },
  5: { title: "The Free Spirit", gift: "adventure, curiosity and fun", watchOut: "can get restless when life feels routine" },
  6: { title: "The Nurturer", gift: "devotion, care and home-making", watchOut: "can over-give, then quietly resent it" },
  7: { title: "The Seeker", gift: "depth, insight and loyalty once trust is earned", watchOut: "can withdraw into their own head" },
  8: { title: "The Achiever", gift: "ambition, strength and provision", watchOut: "can let work crowd out the relationship" },
  9: { title: "The Humanitarian", gift: "compassion, wisdom and big-heartedness", watchOut: "can give to everyone but their partner" },
  11: { title: "The Intuitive (master 11)", gift: "intuition and inspiration", watchOut: "can feel things intensely and get overwhelmed" },
  22: { title: "The Master Builder (master 22)", gift: "vision plus the discipline to build it", watchOut: "can carry too much pressure alone" },
  33: { title: "The Master Teacher (master 33)", gift: "deep compassion and guidance", watchOut: "can neglect their own needs" },
};

const MASTER = new Set([11, 22, 33]);

function parseBirthday(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

const digitSum = (n: number) => String(Math.abs(n)).split("").reduce((sum, d) => sum + Number(d), 0);

/** Reduces to a single digit, keeping master numbers 11, 22 and 33 when asked. */
export function reduceNumber(n: number, keepMasters = true): number {
  let value = Math.abs(n);
  while (value > 9 && !(keepMasters && MASTER.has(value))) value = digitSum(value);
  return value;
}

const ordinal = (month: number, day: number) => month * 100 + day;

export function sunSign(birthday: string): { sign: SunSign; cusp: boolean } | null {
  const b = parseBirthday(birthday);
  if (!b) return null;
  const at = ordinal(b.month, b.day);
  // Signs sorted by start date within the calendar year; Capricorn wraps around New Year.
  const byStart = [...SUN_SIGNS].sort((x, y) => ordinal(...x.start) - ordinal(...y.start));
  let sign = byStart[byStart.length - 1]!; // Capricorn (Dec 22) covers early January too
  for (const s of byStart) if (at >= ordinal(...s.start)) sign = s;
  // Exact boundaries shift by a day between years, so flag the day on either side of one.
  const cusp = SUN_SIGNS.some((s) => {
    const start = new Date(Date.UTC(2001, s.start[0] - 1, s.start[1]));
    const here = new Date(Date.UTC(2001, b.month - 1, b.day));
    const diff = Math.round((here.getTime() - start.getTime()) / 86_400_000);
    return diff === -1 || diff === 0;
  });
  return { sign, cusp };
}

export function chineseZodiac(birthday: string): ChineseZodiac | null {
  const b = parseBirthday(birthday);
  if (!b) return null;
  const animalFor = (year: number) => ANIMALS[(((year - 4) % 12) + 12) % 12]!;
  const at = ordinal(b.month, b.day);
  // Lunar New Year always falls between January 21 and February 20.
  if (at < ordinal(1, 21)) {
    const [animal, emoji] = animalFor(b.year - 1);
    return { animal, emoji, uncertain: false, alternate: null };
  }
  const [animal, emoji] = animalFor(b.year);
  if (at <= ordinal(2, 20)) return { animal, emoji, uncertain: true, alternate: animalFor(b.year - 1)[0] };
  return { animal, emoji, uncertain: false, alternate: null };
}

/** Life Path: reduce month, day and year separately, then the total (masters kept). */
export function lifePath(birthday: string): number | null {
  const b = parseBirthday(birthday);
  if (!b) return null;
  return reduceNumber(reduceNumber(b.month) + reduceNumber(b.day) + reduceNumber(b.year));
}

/** Personal Year for a calendar year: birth month + birth day + that year, reduced to 1 to 9. */
export function personalYear(birthday: string, year: number): number | null {
  const b = parseBirthday(birthday);
  if (!b) return null;
  return reduceNumber(reduceNumber(b.month, false) + reduceNumber(b.day, false) + reduceNumber(year, false), false);
}

export const PERSONAL_YEAR_COPY: Record<number, string> = {
  1: "a fresh-start year: new beginnings and bold moves",
  2: "a patience year: partnership, cooperation and slower growth",
  3: "a social, creative year: fun, expression and friends",
  4: "a work year: building foundations, sometimes heavy",
  5: "a change year: travel, restlessness and surprises",
  6: "a home and love year: family, commitment and responsibility",
  7: "an inward year: reflection, rest and wanting more alone time",
  8: "a power year: career, money and ambition",
  9: "a closing year: endings, letting go and clearing space",
};

export interface Chart {
  sun: { key: string; name: string; symbol: string; element: Element; modality: Modality; traits: string; cusp: boolean };
  chinese: ChineseZodiac;
  lifePath: number;
  lifePathTitle: string;
  personalYear: number;
  personalYearTheme: string;
}

export function chartFor(birthday: string, today: Date): Chart | null {
  const sun = sunSign(birthday);
  const chinese = chineseZodiac(birthday);
  const lp = lifePath(birthday);
  const py = personalYear(birthday, today.getUTCFullYear());
  if (!sun || !chinese || lp === null || py === null) return null;
  return {
    sun: { key: sun.sign.key, name: sun.sign.name, symbol: sun.sign.symbol, element: sun.sign.element, modality: sun.sign.modality, traits: sun.sign.traits, cusp: sun.cusp },
    chinese,
    lifePath: lp,
    lifePathTitle: LIFE_PATH_COPY[lp]!.title,
    personalYear: py,
    personalYearTheme: PERSONAL_YEAR_COPY[py]!,
  };
}

export interface CouplePairing {
  elements: PairingNote;
  sameSign: boolean;
  modalities: string;
  lifePaths: string;
  /** Short, concrete things to keep an eye on, most important first. */
  watchOuts: string[];
  keepItFresh: string[];
}

const MODALITY_NOTES: Record<string, string> = {
  "cardinal+cardinal": "Two starters: lots of initiative, and some tug-of-war over who leads.",
  "fixed+fixed": "Two steady anchors: loyal, and stubborn when you disagree. Someone has to bend first.",
  "mutable+mutable": "Two adapters: easygoing, and decisions can drift. Pick a decider for small things.",
  "cardinal+fixed": "One starts, one sustains: great when the starter doesn't rush and the sustainer doesn't stall.",
  "cardinal+mutable": "One leads, one adapts: smooth, as long as the adapter's preferences still get airtime.",
  "fixed+mutable": "One anchors, one flexes: steady, if the flexible one isn't always the one giving way.",
};

function pairKey<T extends string>(a: T, b: T): string {
  return [a, b].sort().join("+");
}

export function couplePairing(me: Chart, partner: Chart): CouplePairing {
  const elements = ELEMENT_PAIRS[pairKey(me.sun.element, partner.sun.element)]!;
  const sameSign = me.sun.key === partner.sun.key;
  const modalities = MODALITY_NOTES[pairKey(me.sun.modality, partner.sun.modality)]!;
  const mine = LIFE_PATH_COPY[me.lifePath]!;
  const theirs = LIFE_PATH_COPY[partner.lifePath]!;
  const lifePaths =
    me.lifePath === partner.lifePath
      ? `You share Life Path ${me.lifePath} (${mine.title}): the same gifts, and the same blind spot, so you ${mine.watchOut.replace(/^can /, "can both ")}.`
      : `Life Path ${me.lifePath} (${mine.title}) brings ${mine.gift}; Life Path ${partner.lifePath} (${theirs.title}) brings ${theirs.gift}.`;
  const watchOuts = [
    elements.watchOut,
    `You: ${mine.watchOut}. Them: ${theirs.watchOut}.`,
    ...(sameSign ? [SAME_SIGN_NOTE] : []),
  ];
  const keepItFresh = [elements.keepItFresh, `${ELEMENT_COPY[me.sun.element].label} needs ${ELEMENT_COPY[me.sun.element].needs}; ${ELEMENT_COPY[partner.sun.element].label} needs ${ELEMENT_COPY[partner.sun.element].needs}.`];
  return { elements, sameSign, modalities, lifePaths, watchOuts, keepItFresh };
}
