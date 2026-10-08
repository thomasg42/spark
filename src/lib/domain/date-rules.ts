/**
 * Standing date nights (Module E, 2026-10-08): "every Wednesday 6 to 9 PM: date
 * night, then we each go home." Validation (mirrors 20261008000600), the next
 * time it comes around, and a calendar file (.ics) with a weekly repeat so the
 * night lands in each person's own phone calendar with its own reminder.
 *
 * Times are local "floating" times: 6 PM means 6 PM wherever you are, which is
 * what a standing date means. Pure functions, no DOM.
 */
import { UserFacingError, type DateRule, type DateRuleInput } from "@/lib/backend/types";
import { addDays, toISODate, type ISODate } from "./dates";

export const RULE_TITLE_MAX = 120;
export const RULE_NOTE_MAX = 500;
export const MAX_RULES = 5;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const chars = (s: string) => Array.from(s).length;

export interface CleanDateRule {
  title: string;
  weekday: number;
  startTime: string;
  endTime: string;
  note: string | null;
}

export function checkDateRule(input: DateRuleInput): CleanDateRule {
  const title = (input.title ?? "").trim();
  if (!title) throw new UserFacingError("Give your standing date a name, like Date night.");
  if (chars(title) > RULE_TITLE_MAX) throw new UserFacingError(`Keep the name under ${RULE_TITLE_MAX} characters.`);
  const weekday = Number(input.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new UserFacingError("Pick a day of the week.");
  const startTime = (input.startTime ?? "").trim();
  const endTime = (input.endTime ?? "").trim();
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new UserFacingError("Pick a start and end time.");
  if (endTime <= startTime) throw new UserFacingError("The end time needs to be after the start time.");
  const note = (input.note ?? "").trim() || null;
  if (note && chars(note) > RULE_NOTE_MAX) throw new UserFacingError(`Keep the note under ${RULE_NOTE_MAX} characters.`);
  return { title, weekday, startTime, endTime, note };
}

/** "6 PM", "6:30 PM", "12 AM". */
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** "Every Wednesday, 6 to 9 PM" (keeps both suffixes when the night crosses noon). */
export function describeRule(rule: Pick<DateRule, "weekday" | "startTime" | "endTime">): string {
  const start = time12(rule.startTime);
  const end = time12(rule.endTime);
  const sameHalf = start.slice(-2) === end.slice(-2);
  return `Every ${WEEKDAYS[rule.weekday]}, ${sameHalf ? start.replace(/ (AM|PM)$/, "") : start} to ${end}`;
}

const hhmmOf = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * The next time this standing date happens, or is happening, from `now` (local
 * time). Tonight counts until the night is over, so "Wednesday 6 to 9" shows
 * tonight until 9 PM and next week after that.
 */
export function nextOccurrence(rule: Pick<DateRule, "weekday" | "endTime">, now: Date): ISODate {
  const ahead = (rule.weekday - now.getDay() + 7) % 7;
  if (ahead === 0 && hhmmOf(now) >= rule.endTime) return toISODate(addDays(now, 7));
  return toISODate(addDays(now, ahead));
}

/** Active rules, soonest next occurrence first. */
export function upcomingRules<T extends DateRule>(rules: T[], now: Date): Array<{ rule: T; on: ISODate; tonight: boolean }> {
  const today = toISODate(now);
  return rules
    .filter((r) => r.active)
    .map((rule) => {
      const on = nextOccurrence(rule, now);
      return { rule, on, tonight: on === today };
    })
    .sort((a, b) => a.on.localeCompare(b.on) || a.rule.startTime.localeCompare(b.rule.startTime));
}

// --- calendar file (RFC 5545) -----------------------------------------------

/** Escapes TEXT values: backslash, semicolon, comma and newlines. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (UTF-8), never splitting a character. */
export function icsFold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icsLocal = (day: ISODate, hhmm: string) => `${day.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;

/**
 * A calendar file with one weekly repeating event per active rule, each with a
 * reminder an hour before. Starts from the next occurrence so nothing lands in
 * the past. `now` and the uid domain are injectable for tests.
 */
export function rulesToIcs(rules: DateRule[], now: Date, opts: { partnerName?: string } = {}): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Spark//Standing dates//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const rule of rules.filter((r) => r.active)) {
    const day = nextOccurrence(rule, now);
    const description = [rule.note, opts.partnerName ? `With ${opts.partnerName}. Set in Spark.` : "Set in Spark."].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${rule.id}@spark-standing-dates`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART:${icsLocal(day, rule.startTime)}`,
      `DTEND:${icsLocal(day, rule.endTime)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[rule.weekday]}`,
      `SUMMARY:${icsEscape(rule.title)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(rule.title)}`,
      "TRIGGER:-PT1H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
