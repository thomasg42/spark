"use client";
/**
 * Money: savings goals. Joint goals belong to both of you. "Mine" goals are only
 * yours: your partner sees one only if you turn on "Let my partner see this",
 * and even then can't change it. Spark Buddy can see the same goals you can.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { Badge, Button, ButtonLink, Card, ChoiceGroup, EmptyState, LoadingBlock, Notice, PageHeader, ProgressBar, SectionTitle, TextField, useToast } from "@/components/ui";
import { messageOf, type MoneyGoal, type MoneyScope } from "@/lib/backend/types";
import { formatDate } from "@/lib/domain/dates";
import { formatMoney, monthlyToTarget, parseMoney } from "@/lib/domain/plans-rules";
import { useLoad } from "@/lib/ui/hooks";

export function MoneyScreen() {
  const { backend, user, partner } = useApp();
  const toast = useToast();
  const partnerName = partner?.nickname || partner?.displayName || "Your partner";
  const list = useLoad(() => backend.money.list(), [backend, user?.id]);
  const goals = list.data ?? [];
  const joint = goals.filter((g) => g.scope === "joint");
  const mine = goals.filter((g) => g.scope === "mine" && g.ownerId === user?.id);
  const theirs = goals.filter((g) => g.scope === "mine" && g.ownerId !== user?.id);
  const total = (gs: MoneyGoal[]) => gs.reduce((n, g) => n + g.savedCents, 0);

  const [scope, setScope] = useState<MoneyScope>("joint");
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [visible, setVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const savedCents = saved.trim() ? parseMoney(saved) : 0;
    const targetCents = target.trim() ? parseMoney(target) : null;
    if (savedCents === null || savedCents < 0) return setError("Enter how much is saved, like 250.");
    if (target.trim() && (targetCents === null || targetCents <= 0)) return setError("Enter a target, like 3000.");
    setAdding(true);
    try {
      await backend.money.add({ scope, title, savedCents, targetCents, targetDate: targetDate || null, visibleToPartner: scope === "mine" ? visible : true });
      setTitle("");
      setSaved("");
      setTarget("");
      setTargetDate("");
      setShowForm(false);
      await list.reload();
      toast.show("Goal added.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <PageHeader title="Money" subtitle="What you're saving, together and on your own." back={{ href: "/plans/", label: "Plans" }} />
      {list.error ? <Notice tone="danger" title={list.error} /> : null}
      {list.loading && !list.data ? <LoadingBlock /> : null}

      {list.data ? (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-sm text-muted">Saved together</p>
            <p className="text-2xl font-bold text-ink">{formatMoney(total(joint))}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted">Saved on your own</p>
            <p className="text-2xl font-bold text-ink">{formatMoney(total(mine))}</p>
          </Card>
        </div>
      ) : null}

      <Button className="mb-4 w-full" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
        {showForm ? "Close" : "Add a savings goal"}
      </Button>
      {showForm ? (
        <Card className="mb-5">
          <form onSubmit={add}>
            <ChoiceGroup
              legend="Whose goal is this?"
              name="goal-scope"
              options={[
                { value: "joint", label: "Ours (joint)", description: `You and ${partnerName} both see and update it.` },
                { value: "mine", label: "Just mine", description: `Only you see it, unless you choose to let ${partnerName} see it.` },
              ]}
              value={scope}
              onChange={setScope}
            />
            <TextField label="Name" value={title} onChange={setTitle} placeholder={scope === "joint" ? "Vacation fund, essentials cushion…" : "My savings, new camera…"} maxLength={80} />
            <TextField label="Saved so far ($)" value={saved} onChange={setSaved} inputMode="numeric" placeholder="0" optional />
            <TextField label="Target ($)" value={target} onChange={setTarget} inputMode="numeric" placeholder="3000" optional />
            <TextField label="Target date" type="date" value={targetDate} onChange={setTargetDate} optional />
            {scope === "mine" ? (
              <label className="mb-4 flex min-h-11 items-center gap-3 text-ink">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
                Let {partnerName} see this goal (they can't change it)
              </label>
            ) : null}
            {error ? <Notice tone="danger" className="mb-3" title={error} /> : null}
            <Button type="submit" loading={adding} disabled={!title.trim()}>
              Add goal
            </Button>
          </form>
        </Card>
      ) : null}

      {list.data && goals.length === 0 ? <EmptyState emoji="💵" title="No savings goals yet" body="Start with one you share, like a vacation fund, or one just for you." /> : null}

      {joint.length ? <SectionTitle>Together</SectionTitle> : null}
      <div className="space-y-3">{joint.map((g) => <GoalCard key={g.id} goal={g} editable onChanged={list.reload} />)}</div>

      {mine.length ? <SectionTitle>Just yours</SectionTitle> : null}
      <div className="space-y-3">{mine.map((g) => <GoalCard key={g.id} goal={g} editable mine partnerName={partnerName} onChanged={list.reload} />)}</div>

      {theirs.length ? <SectionTitle>{partnerName}'s, shared with you</SectionTitle> : null}
      <div className="space-y-3">{theirs.map((g) => <GoalCard key={g.id} goal={g} editable={false} onChanged={list.reload} />)}</div>

      <div className="mt-6">
        <ButtonLink href="/us/buddy/" variant="secondary" className="w-full">
          Ask Buddy about your savings
        </ButtonLink>
      </div>
      <p className="mt-4 text-xs text-muted">Spark helps you keep track. It isn't a bank or a financial advisor, and it never connects to your accounts.</p>
    </>
  );
}

function GoalCard({ goal: g, editable, mine = false, partnerName, onChanged }: { goal: MoneyGoal; editable: boolean; mine?: boolean; partnerName?: string; onChanged(): Promise<void> }) {
  const { backend, user } = useApp();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monthly = useMemo(() => monthlyToTarget(g.savedCents, g.targetCents, g.targetDate), [g.savedCents, g.targetCents, g.targetDate]);

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      toast.show(message);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const change = (sign: 1 | -1) => {
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return setError("Enter an amount, like 50.");
    void run(async () => {
      await backend.money.addSaved(g.id, sign * cents);
      setAmount("");
    }, sign > 0 ? `Added ${formatMoney(cents)}.` : `Took out ${formatMoney(cents)}.`);
  };

  return (
    <Card as="article" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-ink">{g.title}</h3>
        {mine ? <Badge tone={g.visibleToPartner ? "accent" : "muted"}>{g.visibleToPartner ? "Shared" : "Only you"}</Badge> : null}
      </div>
      <p className="mt-1 text-2xl font-bold text-ink">
        {formatMoney(g.savedCents)}
        {g.targetCents ? <span className="text-base font-normal text-muted"> of {formatMoney(g.targetCents)}</span> : null}
      </p>
      {g.targetCents ? (
        <div className="mt-2">
          <ProgressBar value={Math.min(g.savedCents, g.targetCents)} max={g.targetCents} label={`${g.title} progress`} />
        </div>
      ) : null}
      {g.targetDate ? (
        <p className="mt-2 text-sm text-muted">
          Target {formatDate(g.targetDate)}
          {monthly ? ` · about ${formatMoney(monthly)} a month to get there` : g.targetCents && g.savedCents >= g.targetCents ? " · reached! 🎉" : ""}
        </p>
      ) : null}
      {editable ? (
        <div className="mt-3 border-t border-line pt-3">
          <TextField label="Amount ($)" value={amount} onChange={setAmount} inputMode="numeric" placeholder="50" />
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" loading={busy} onClick={() => change(1)}>
              Add
            </Button>
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => change(-1)}>
              Take out
            </Button>
            {mine ? (
              <Button variant="ghost" className="min-h-11 text-sm" disabled={busy} onClick={() => void run(() => backend.money.update(g.id, { visibleToPartner: !g.visibleToPartner }), g.visibleToPartner ? "Now only you see it." : `${partnerName ?? "Your partner"} can see it now.`)}>
                {g.visibleToPartner ? "Hide from partner" : `Let ${partnerName ?? "partner"} see it`}
              </Button>
            ) : null}
            {g.ownerId === user?.id ? (
              <Button variant="danger" className="min-h-11 text-sm" disabled={busy} onClick={() => void run(() => backend.money.remove(g.id), "Goal removed.")}>
                Remove goal
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <Notice tone="danger" className="mt-2" title={error} /> : null}
    </Card>
  );
}
