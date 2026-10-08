"use client";
import { CoachingWelcome } from "@/components/dreams/coaching-welcome";
/**
 * Home: a calm start screen with no repeats of the bottom tabs. Just a greeting,
 * anything worth celebrating soon, and the person's own favorites, each a row
 * with an arrow that opens the full screen.
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { loadCheckinHistory } from "@/components/checkin/history";
import { DrillList, DrillRow } from "@/components/drill-row";
import { RequireStage } from "@/components/require-stage";
import { RhythmCards } from "@/components/rhythm/rhythm-cards";
import { Button, Card, ChoiceGroup, useToast } from "@/components/ui";
import { CADENCE_LABELS } from "@/lib/domain/cadence";
import { formatDate, periodOf, toISODate, upcomingAnniversaries, weekStartOf } from "@/lib/domain/dates";
import { quickCheckinDue } from "@/lib/domain/rhythm";
import { describeRule, upcomingRules } from "@/lib/domain/date-rules";
import { formatMoney } from "@/lib/domain/plans-rules";
import { SOCIAL_COPY, socialAgreement } from "@/lib/domain/social";
import { FAVORITE_CATALOG, loadFavorites, saveFavorites, toggleFavorite, type FavoriteId } from "@/lib/ui/favorites";
import { useLoad } from "@/lib/ui/hooks";
import { useRhythm } from "@/lib/ui/rhythm";
import { lastQuickCheckin } from "@/components/checkin/checkin-prompt";
import { SECTIONS, sectionProgress } from "@shared/questionnaires.ts";

const settle = <T,>(p: Promise<T>) => p.then((v) => v, () => null);

function Dashboard() {
  const { backend, user, profile, partner } = useApp();
  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const [favorites, setFavorites] = useState<FavoriteId[] | null>(null);
  const [editing, setEditing] = useState(false);
  const { rhythm } = useRhythm();

  useEffect(() => {
    if (user) setFavorites(loadFavorites(user.id));
  }, [user]);

  const wants = (id: FavoriteId) => favorites?.includes(id) ?? false;
  const data = useLoad(async () => {
    if (!favorites) return null;
    const [story, ideas, notes, answers, history, pulses, plans, rules, projects, money] = await Promise.all([
      settle(backend.story.list()),
      wants("ideas") ? settle(backend.ideas.list()) : null,
      wants("notes") ? settle(backend.notes.list()) : null,
      wants("questions") ? settle(backend.answers.list()) : null,
      wants("monthly") ? settle(loadCheckinHistory(backend, 2)) : null,
      wants("pulse") ? settle(backend.pulse.history(8)) : null,
      settle(backend.datePlans.list()),
      settle(backend.dateRules.list()),
      wants("projects") ? settle(backend.projects.list()) : null,
      wants("money") ? settle(backend.money.list()) : null,
    ]);
    const week = wants("pulse") ? await settle(backend.pulse.status(weekStartOf(today))) : null;
    return { story, ideas, notes, answers, history, pulses, week, plans, rules, projects, money };
  }, [backend, user?.id, favorites?.join(",")]);

  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const d = data.data;
  const anniversary = d?.story ? upcomingAnniversaries(d.story, today, 30)[0] : undefined;
  const nextPlan = d?.plans?.find((p) => p.plannedFor >= toISODate(today));
  const nextStanding = d?.rules ? upcomingRules(d.rules, today)[0] : undefined;

  const status = (id: FavoriteId): { text: string; badge?: string | null } => {
    switch (id) {
      case "dreams": return { text: "Dream board, weekly support, and Life Anchors" };
      case "ideas": {
        const saved = d?.ideas?.filter((i) => i.status === "saved").length ?? 0;
        return { text: saved ? `${saved} saved for later` : "Five fresh ideas, never repeats" };
      }
      case "pulse": {
        const last = d?.pulses && user ? lastQuickCheckin(d.pulses, user.id) : null;
        const q = quickCheckinDue(rhythm.current, last, today);
        if (d?.week?.partnerSubmitted && !d.week.iSubmitted) return { text: `${partnerName} checked in this week. Add yours.`, badge: "Due" };
        if (d?.week?.iSubmitted) return { text: d.week.partnerSubmitted ? "You're both in this week" : `Done this week. Waiting for ${partnerName}.` };
        if (!rhythm.current) return { text: "Two quick taps" };
        return q.due ? { text: `Due now · ${CADENCE_LABELS[rhythm.current].toLowerCase()}`, badge: "Due" } : { text: `Next around ${q.nextDue ? formatDate(toISODate(q.nextDue)) : "soon"}` };
      }
      case "monthly": {
        const current = d?.history?.find((h) => h.period === periodOf(today));
        if (current?.revealed) return { text: "Revealed. Read it together.", badge: "New" };
        if (current?.iSubmitted) return { text: `Hidden until ${partnerName} answers` };
        return { text: "Five private questions this month", badge: "Open" };
      }
      case "notes": {
        const latest = d?.notes?.find((n) => n.authorId === partner?.userId);
        return { text: latest ? `“${latest.body}”` : `Send ${partnerName} a one-line thank-you` };
      }
      case "story":
        return { text: d?.story?.length ? `${d.story.length} ${d.story.length === 1 ? "memory" : "memories"} so far` : "Start with how you met" };
      case "questions": {
        const saved = Object.fromEntries((d?.answers ?? []).map((a) => [a.questionId, a]));
        const progress = SECTIONS.map((s) => sectionProgress(s, saved));
        const done = progress.reduce((n, p) => n + p.answered + p.skipped, 0);
        const total = progress.reduce((n, p) => n + p.total, 0);
        return { text: d?.answers ? `${done} of ${total} answered, privately` : "Short private sets about you" };
      }
      case "log":
        return { text: "Add something you did together" };
      case "buddy":
        return { text: `Talk it through, fill in your answers, plan time with ${partnerName}` };
      case "projects": {
        const open = d?.projects?.filter((p) => p.status !== "done") ?? [];
        return { text: open.length ? `1. ${open[0]!.title}${open.length > 1 ? ` · ${open.length - 1} more` : ""}` : "What you're working on, in order" };
      }
      case "money": {
        const joint = d?.money?.filter((g) => g.scope === "joint") ?? [];
        const saved = joint.reduce((n, g) => n + g.savedCents, 0);
        return { text: joint.length ? `${formatMoney(saved)} saved together` : "Savings goals, yours and joint" };
      }
      case "agreements": {
        const social = socialAgreement(profile?.socialSharing ?? null, partner?.socialSharing ?? null);
        const pace = rhythm.current ? CADENCE_LABELS[rhythm.current] : "Rhythm pending";
        return { text: `${pace} · ${social.agreed ? SOCIAL_COPY[social.agreed].label : "Social pending"}` };
      }
    }
  };

  const shown = FAVORITE_CATALOG.filter((f) => favorites?.includes(f.id));

  return (
    <div className="fade-up">
      <h1 className="text-3xl font-bold text-ink">Hi, {profile?.nickname || profile?.displayName}</h1>

      <CoachingWelcome />
      <RhythmCards />

      {anniversary ? (
        <Card className="mt-5 bg-accent-soft">
          <p className="text-sm font-semibold text-accent-text">Coming up</p>
          <p className="mt-1 text-lg font-bold text-ink">
            {anniversary.entry.title}: {anniversary.years} {anniversary.years === 1 ? "year" : "years"}
          </p>
          <p className="text-sm text-ink">{anniversary.inDays === 0 ? "Today!" : `In ${anniversary.inDays} ${anniversary.inDays === 1 ? "day" : "days"}`}</p>
        </Card>
      ) : null}

      {nextStanding && (!nextPlan || nextStanding.on <= nextPlan.plannedFor) ? (
        <Card className="mt-5">
          <p className="text-sm font-semibold text-accent-text">{nextStanding.tonight ? "Tonight, just you two" : "Your standing date"}</p>
          <p className="mt-1 text-lg font-bold text-ink">{nextStanding.rule.title}</p>
          <p className="text-sm text-ink">
            {describeRule(nextStanding.rule)}
            {nextStanding.tonight ? "" : ` · next ${formatDate(nextStanding.on)}`}
          </p>
        </Card>
      ) : null}

      {nextPlan ? (
        <Card className="mt-5">
          <p className="text-sm font-semibold text-accent-text">Next up, just you two</p>
          <p className="mt-1 text-lg font-bold text-ink">{nextPlan.title}</p>
          <p className="text-sm text-ink">
            {formatDate(nextPlan.plannedFor)}
            {nextPlan.time ? ` · ${nextPlan.time}` : ""}
          </p>
        </Card>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">Your favorites</h2>
        <Button variant="ghost" className="min-h-11 px-3" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? "Done" : "Edit favorites"}
        </Button>
      </div>

      {editing && favorites && user ? (
        <Card className="mt-3">
          <ChoiceGroup
            legend="Show on my home screen"
            hint="Only you see your favorites. Moments, Check-in, Plans and Us are always in the bar at the bottom."
            multiple
            options={FAVORITE_CATALOG.map((f) => ({ value: f.id, label: `${f.icon}  ${f.title}` }))}
            value={favorites}
            onChange={(next: FavoriteId[]) => {
              const changed = FAVORITE_CATALOG.find((f) => next.includes(f.id) !== favorites.includes(f.id));
              const updated = changed ? toggleFavorite(favorites, changed.id) : favorites;
              setFavorites(updated);
              saveFavorites(user.id, updated);
              if (changed) toast.show(updated.includes(changed.id) ? `${changed.title} added` : `${changed.title} removed`);
            }}
          />
        </Card>
      ) : null}

      <div className="mt-3">
        {shown.length === 0 && favorites ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line px-5 py-6 text-center text-muted">No favorites yet. Tap Edit favorites to pick a few.</p>
        ) : (
          <DrillList label="Your favorites">
            {shown.map((f) => {
              const s = status(f.id);
              return (
                <li key={f.id}>
                  <DrillRow href={f.href} icon={f.icon} title={f.title} status={s.text} badge={s.badge ?? null} />
                </li>
              );
            })}
          </DrillList>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <RequireStage allow="ready">
      <Dashboard />
    </RequireStage>
  );
}
