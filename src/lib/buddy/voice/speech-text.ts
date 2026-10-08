/**
 * Turns Buddy's written reply into something that sounds natural out loud:
 * no bullets, emoji, markdown or links read aloud, list lines become short
 * spoken sentences, and the text is cut into sentence-sized chunks (Chrome
 * stops long utterances after roughly 15 seconds, and short chunks let Buddy
 * start talking sooner and be interrupted cleanly).
 *
 * Pure functions: no DOM, safe to unit test.
 */

export const SPEECH_MAX_CHARS = 1500;
// About 10 seconds of speech even at the calmest rate, safely under Chrome's ~15 s cutoff.
export const CHUNK_MAX = 160;

// Pictographs, dingbats, flags, variation selectors and joiners: seen, not spoken.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{2726}\u{2665}\u{2661}\u{221E}\u{2302}\u{25F7}]/gu;

/** Cleans a reply for speech. Keeps the words; drops what a person wouldn't say. */
export function toSpeechText(text: string): string {
  const lines = (text ?? "")
    .slice(0, SPEECH_MAX_CHARS * 2)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/&/g, " and ") // Edge's natural voices stop at '&', '<' and '>'
    .replace(/[*_`#<>]+/g, "")
    .replace(EMOJI, "")
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*(?:[•\-–—]|\d+[.)])\s+/, "") // bullets and "1." list markers
        .replace(/\s+·\s+/g, ", ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    // Each list line ends as its own sentence so the voice pauses between items.
    .map((line) => (/[.!?:;,"”)]$/.test(line) ? line : `${line}.`));
  return lines.join(" ").slice(0, SPEECH_MAX_CHARS).trim();
}

// Periods that don't end a sentence: decimals ($1,200.50), times (7.30), and common abbreviations.
const HOLD = "\u0000";
const ABBREVIATIONS = /\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|e\.g|i\.e|approx|No)\./g;

function protectPeriods(text: string): string {
  return text.replace(/(\d)\.(\d)/g, `$1${HOLD}$2`).replace(ABBREVIATIONS, (m) => m.replace(/\./g, HOLD));
}
const restorePeriods = (text: string) => text.split(HOLD).join(".");

/**
 * Splits speech text into chunks at sentence boundaries, never mid-word. The
 * first chunk is a single sentence so Buddy starts talking quickly; later
 * sentences are packed together up to the limit.
 */
export function chunkForSpeech(text: string, max = CHUNK_MAX): string[] {
  const clean = protectPeriods(text.replace(/\s+/g, " ").trim());
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+(?:[.!?]+["”')]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  const push = (piece: string) => {
    if (!current) current = piece;
    else if (chunks.length > 0 && current.length + 1 + piece.length <= max) current = `${current} ${piece}`;
    else {
      chunks.push(current);
      current = piece;
    }
  };
  for (const sentence of sentences) {
    if (sentence.length <= max) {
      push(sentence);
      continue;
    }
    // A very long sentence: break at commas, then at word boundaries.
    for (const part of sentence.split(/(?<=[,;:])\s+/)) {
      if (part.length <= max) push(part);
      else {
        let rest = part;
        while (rest.length > max) {
          const cut = rest.lastIndexOf(" ", max);
          const at = cut > max / 2 ? cut : max;
          push(rest.slice(0, at).trim());
          rest = rest.slice(at).trim();
        }
        if (rest) push(rest);
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.map(restorePeriods);
}
