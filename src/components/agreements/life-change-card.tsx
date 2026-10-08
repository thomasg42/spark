"use client";
/**
 * "Big life change?" (Module E): a new job, a new schedule or a move makes
 * quick check-ins come one step more often for six weeks. Both partners see the
 * log; only the person who added an entry can remove it.
 */
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, ChoiceGroup, Notice, TextAreaField, TextField, useToast } from "@/components/ui";
import type { LifeChangeKind } from "@/lib/backend/types";
import { formatDate, toISODate } from "@/lib/domain/dates";
import { LIFE_CHANGE_COPY, LIFE_CHANGE_KINDS, LIFE_CHANGE_NOTE_MAX } from "@/lib/domain/rhythm-breaker";
import { useAction, useLoad } from "@/lib/ui/hooks";

export function LifeChangeCard({ onChange }: { onChange?: () => void }) {
  const { backend, user, nameOf } = useApp();
  const toast = useToast();
  const list = useLoad(() => backend.lifeChanges.list(), [backend, user?.id]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LifeChangeKind | null>(null);
  const [day, setDay] = useState(() => toISODate(new Date()));
  const [note, setNote] = useState("");

  const add = useAction(async () => {
    if (!kind) throw new Error("Pick what changed.");
    await backend.lifeChanges.add({ kind, happenedOn: day, note });
    await list.reload();
    onChange?.();
    setOpen(false);
    setKind(null);
    setNote("");
    toast.show("Logged. Check-ins will come a little more often for six weeks.");
    return true;
  });

  return (
    <Card className="mt-5" aria-labelledby="life-change-title">
      <h2 id="life-change-title" className="text-xl font-bold text-ink">Big life change?</h2>
      <p className="mt-1 text-sm text-muted">A new job, a new schedule or a move? Log it and your quick check-ins come a little more often for six weeks, so nothing slips while life is busy. You both see this.</p>

      {list.data?.length ? (
        <ul className="mt-3 divide-y divide-line">
          {list.data.map((c) => (
            <li key={c.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">
                  <span aria-hidden>{LIFE_CHANGE_COPY[c.kind].emoji}</span> {LIFE_CHANGE_COPY[c.kind].label} · {formatDate(c.happenedOn)}
                </span>
                <span className="block text-sm text-muted">
                  {c.note ? `${c.note} · ` : ""}added by {nameOf(c.createdBy)}
                </span>
              </span>
              {c.createdBy === user?.id ? (
                <Button
                  variant="ghost"
                  className="min-h-11 text-sm"
                  onClick={async () => {
                    try {
                      await backend.lifeChanges.remove(c.id);
                      await list.reload();
                      onChange?.();
                      toast.show("Removed.");
                    } catch (e) {
                      toast.show(e instanceof Error ? e.message : "Could not remove it.", "error");
                    }
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-4">
          <ChoiceGroup legend="What changed?" options={LIFE_CHANGE_KINDS.map((k) => ({ value: k, label: `${LIFE_CHANGE_COPY[k].emoji}  ${LIFE_CHANGE_COPY[k].label}` }))} value={kind} onChange={setKind} columns={2} name="life-change-kind" />
          <TextField label="When" type="date" value={day} onChange={setDay} />
          <TextAreaField label="Anything to add?" optional value={note} onChange={setNote} rows={2} maxLength={LIFE_CHANGE_NOTE_MAX} placeholder="New shifts start at 6 AM" />
          {add.error ? <Notice tone="danger" className="mb-3" title={add.error} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button loading={add.pending} disabled={!kind} onClick={() => void add.run()}>
              Log it
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
          Log a life change
        </Button>
      )}
    </Card>
  );
}
