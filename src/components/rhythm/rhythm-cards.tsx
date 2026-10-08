"use client";
/**
 * Rhythm Breaker cards on Home (Module E): shown only when a rut signal fires
 * (same kinds of dates for 3+ weeks, excitement dipping two weeks running, two
 * weeks without time together, a big life change). Each offers one or two
 * specific things to do and can be put off for a week ("Not now", just for you).
 * They never name or blame either partner.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Card } from "@/components/ui";
import { loadSnoozes, rhythmCards, saveSnooze, type RhythmCard } from "@/lib/domain/rhythm-breaker";
import type { SignalKind } from "@/lib/domain/triggers";
import { useLoad } from "@/lib/ui/hooks";

const settle = <T,>(p: Promise<T>, empty: T) => p.then((v) => v, () => empty);

export function RhythmCards() {
  const { backend, user } = useApp();
  const today = useMemo(() => new Date(), []);
  const [snoozed, setSnoozed] = useState<Partial<Record<SignalKind, string>>>({});
  useEffect(() => {
    if (user) setSnoozed(loadSnoozes(user.id));
  }, [user]);

  const data = useLoad(async () => {
    const [activities, pulses, lifeChanges, rules] = await Promise.all([
      settle(backend.activities.list(), []),
      settle(backend.pulse.history(4), []),
      settle(backend.lifeChanges.list(), []),
      settle(backend.dateRules.list(), []),
    ]);
    return { activities, pulses, lifeChanges, rules };
  }, [backend, user?.id]);

  const cards: RhythmCard[] = data.data ? rhythmCards({ ...data.data, today, snoozed }) : [];
  if (!cards.length) return null;

  return (
    <section aria-label="A little nudge" className="mt-5 space-y-3">
      {cards.map((card) => (
        <Card key={card.id} className="border-accent">
          <p className="text-sm font-semibold text-accent-text">A little nudge</p>
          <p className="mt-1 text-ink">{card.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {card.actions.map((a) => (
              <Link key={a.href} href={a.href} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">
                {a.label}
              </Link>
            ))}
            <button
              type="button"
              className="min-h-11 px-3 text-sm font-semibold text-accent-text underline"
              onClick={() => user && setSnoozed(saveSnooze(user.id, card.id, today))}
            >
              Not now
            </button>
          </div>
        </Card>
      ))}
    </section>
  );
}
