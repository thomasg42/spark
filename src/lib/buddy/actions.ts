/**
 * Turns a Buddy proposal into a real change, through the same backend calls the
 * screens use (so every validation and privacy rule applies). Nothing here runs
 * unless the person confirms the card, or turned on auto-save for interview answers.
 */
import type { BuddyAction } from "@shared/buddy.ts";
import { answerToText, SHARE_COPY } from "@shared/buddy.ts";
import { findQuestion } from "@shared/questionnaires.ts";
import type { Backend } from "@/lib/backend/types";
import { formatDate } from "@/lib/domain/dates";
import { formatMoney, PROJECT_KIND_COPY } from "@/lib/domain/plans-rules";

export const NAV_HREF: Record<Extract<BuddyAction, { type: "open" }>["to"], { href: string; label: string }> = {
  sharing: { href: "/us/buddy/sharing/", label: "What Buddy may share" },
  stars: { href: "/us/stars/", label: "Our stars & numbers" },
  questions: { href: "/us/questions/", label: "Questions" },
  ideas: { href: "/plans/ideas/", label: "Date ideas" },
  checkin: { href: "/checkin/", label: "Check-in" },
  projects: { href: "/plans/projects/", label: "Projects" },
  money: { href: "/plans/money/", label: "Money" },
};

const time12 = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return ` at ${((h! + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h! >= 12 ? "PM" : "AM"}`;
};

/** A short title and detail for the confirmation card, plus the confirm button label. */
export function describeAction(action: BuddyAction, partnerName: string): { title: string; detail: string; confirm: string } {
  switch (action.type) {
    case "save_answer": {
      const q = findQuestion(action.questionId)?.question;
      return { title: q?.prompt ?? "Save answer", detail: q ? answerToText(q, action.value) : String(action.value), confirm: "Save" };
    }
    case "skip_question":
      return { title: findQuestion(action.questionId)?.question.prompt ?? "Skip", detail: "Skip this one for now.", confirm: "Skip" };
    case "set_share":
      return {
        title: `Share: ${findQuestion(action.questionId)?.question.prompt ?? action.questionId}`,
        detail: action.level === "hint" ? `${SHARE_COPY.hint.label}: “${action.hint}”` : SHARE_COPY[action.level].body,
        confirm: action.level === "private" ? "Keep it off the table" : "Share it",
      };
    case "plan_date":
      return { title: action.title, detail: `${formatDate(action.date)}${time12(action.time)} · on the calendar ${partnerName} sees too`, confirm: "Add it" };
    case "send_note":
      return { title: `Note to ${partnerName}`, detail: `“${action.body}”`, confirm: "Send" };
    case "update_profile":
      return { title: "Update your profile", detail: `${action.field === "birthTime" ? "Birth time" : action.field === "birthPlace" ? "Birthplace" : "Nickname"}: ${action.value}`, confirm: "Update" };
    case "add_project":
      return { title: "New project", detail: `${PROJECT_KIND_COPY[action.kind].emoji} ${action.title}`, confirm: "Add it" };
    case "log_savings":
      return { title: action.goalTitle, detail: `${action.cents < 0 ? "Take out" : "Add"} ${formatMoney(Math.abs(action.cents))}`, confirm: "Save" };
    case "open":
      return { title: NAV_HREF[action.to].label, detail: "", confirm: "Open" };
  }
}

/** Runs a confirmed action and returns a short confirmation to show. */
export async function runAction(backend: Backend, action: BuddyAction, partnerName: string): Promise<string> {
  switch (action.type) {
    case "save_answer":
      await backend.answers.save(action.questionId, action.value);
      return "Answer saved, privately.";
    case "skip_question":
      await backend.answers.skip(action.questionId);
      return "Skipped.";
    case "set_share":
      await backend.buddy.share(action.questionId, action.level, action.hint);
      return action.level === "private" ? "Kept off the table." : "Sharing updated.";
    case "plan_date":
      await backend.datePlans.add({ title: action.title, plannedFor: action.date, time: action.time, note: action.note });
      return `On the calendar for ${formatDate(action.date)}.`;
    case "send_note":
      await backend.notes.send(action.body);
      return `Sent to ${partnerName}.`;
    case "update_profile":
      await backend.profiles.update({ [action.field]: action.value });
      return "Profile updated.";
    case "add_project":
      await backend.projects.add({ title: action.title, kind: action.kind });
      return "Project added.";
    case "log_savings":
      await backend.money.addSaved(action.goalId, action.cents);
      return "Savings recorded.";
    case "open":
      return "";
  }
}
