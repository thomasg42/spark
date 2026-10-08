"use client";
/**
 * /us/hints/: "Hints from Sam" (Module H). What Sam chose to share with you:
 * approved hints (never Sam's own words), what Sam shared openly, Sam's pattern
 * card, and any hint waiting for a moment that's happening now. Everything else
 * Sam shared is locked until you answer the same question yourself (Thomas:
 * "if they don't answer they get no hints ... just keep on answering").
 *
 * Also your own "I'm feeling a bit distant" switch: Sam sees it, and the hints
 * you set for that moment show up for Sam. It fades after two weeks.
 */
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { Badge, Button, Card, EmptyState, LoadingBlock, Notice, PageHeader, useToast } from "@/components/ui";
import { formatDate, toISODate, addDays } from "@/lib/domain/dates";
import { FLAG_DAYS, flagActive } from "@/lib/domain/hint-moments";
import { patternCardFrom } from "@/lib/domain/pattern-card";
import { useAction, useLoad } from "@/lib/ui/hooks";
import { HINT_MOMENT_COPY } from "@shared/buddy.ts";
import { findQuestion } from "@shared/questionnaires.ts";

export function HintsScreen() {
  const { backend, user, partner } = useApp();
  const toast = useToast();
  const name = partner?.nickname || partner?.displayName || "Your partner";
  const data = useLoad(async () => {
    const [hints, flags] = await Promise.all([backend.buddy.partnerHints(), backend.distanceFlags.list()]);
    return { ...hints, flags };
  }, [backend, user?.id]);

  const now = new Date();
  const mine = data.data?.flags.find((f) => f.userId === user?.id && flagActive(f, now));
  const theirs = data.data?.flags.find((f) => f.userId === partner?.userId && flagActive(f, now));
  const shares = data.data?.shares ?? [];
  const pattern = patternCardFrom(shares);
  const inPattern = new Set(pattern ? pattern.lines.map((l) => l.questionId) : []);
  const distantHints = shares.filter((s) => s.showWhen === "feeling_distant");
  const hints = shares.filter((s) => s.level === "hint" && s.showWhen !== "feeling_distant");
  const open = shares.filter((s) => s.level === "open" && !inPattern.has(s.questionId));
  const teasers = data.data?.teasers ?? [];

  const flag = useAction(async (raise: boolean) => {
    if (raise) await backend.distanceFlags.raise();
    else await backend.distanceFlags.clear();
    await data.reload();
    toast.show(raise ? `${name} will see it. Be gentle with yourself.` : "Cleared.");
    return true;
  });

  return (
    <>
      <PageHeader title={`Hints from ${name}`} subtitle={`What ${name} chose to share with you. Answer the same questions to unlock more.`} back={{ href: "/us/", label: "Us" }} />
      {data.error ? <Notice tone="danger" className="mb-3" title={data.error} /> : null}
      {data.loading && !data.data ? <LoadingBlock /> : null}

      {theirs ? (
        <Card className="mb-4 border-accent bg-accent-soft">
          <p className="text-lg font-bold text-ink">{name} is feeling a bit distant right now.</p>
          <p className="mt-1 text-sm text-ink">No blame, just a heads-up {name} chose to send.</p>
          {distantHints.length ? (
            <ul className="mt-3 space-y-2">
              {distantHints.map((h) => (
                <li key={h.questionId} className="rounded-2xl bg-surface px-3 py-2 text-ink">
                  <span className="text-sm font-semibold text-muted">What helps {name}: </span>
                  {h.text}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/checkin/notes/" className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">Send a little note</Link>
            <Link href="/us/buddy/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-accent-text">Plan time with Buddy</Link>
          </div>
        </Card>
      ) : null}

      {pattern ? (
        <Card className="mb-4" aria-labelledby="pattern-title">
          <h2 id="pattern-title" className="text-xl font-bold text-ink">{name}&apos;s pattern card</h2>
          <dl className="mt-2 space-y-2">
            {pattern.lines.map((l) => (
              <div key={l.questionId}>
                <dt className="text-sm font-semibold text-accent-text">{l.lead}</dt>
                <dd className="text-ink">{l.text}.</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">In {name}&apos;s own words, shared openly.</p>
        </Card>
      ) : null}

      {hints.length ? (
        <section aria-labelledby="hints-title" className="mb-4">
          <h2 id="hints-title" className="mb-2 text-xl font-bold text-ink">Hints</h2>
          <ul className="space-y-2">
            {hints.map((h) => (
              <li key={h.questionId}>
                <Card as="div" className="p-4">
                  <p className="text-ink">{h.text}</p>
                  {h.showWhen ? <p className="mt-1 text-sm font-semibold text-accent-text">{HINT_MOMENT_COPY[h.showWhen].showing.replace("they", name)}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open.length ? (
        <section aria-labelledby="open-title" className="mb-4">
          <h2 id="open-title" className="mb-2 text-xl font-bold text-ink">Shared openly</h2>
          <ul className="space-y-2">
            {open.map((s) => (
              <li key={s.questionId}>
                <Card as="div" className="p-4">
                  <p className="text-sm font-semibold text-muted">{findQuestion(s.questionId)?.question.prompt}</p>
                  <p className="mt-1 text-ink">{s.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {teasers.length ? (
        <section aria-labelledby="locked-title" className="mb-4">
          <h2 id="locked-title" className="mb-1 text-xl font-bold text-ink">Waiting for you</h2>
          <p className="mb-2 text-sm text-muted">{name} shared {teasers.length === 1 ? "one more thing" : `${teasers.length} more things`}. Answer the same {teasers.length === 1 ? "question" : "questions"} to unlock {teasers.length === 1 ? "it" : "them"}. No answer, no hints.</p>
          <ul className="space-y-2">
            {teasers.map((t) => {
              const found = findQuestion(t.questionId);
              if (!found) return null;
              return (
                <li key={t.questionId}>
                  <Card as="div" className="flex items-center justify-between gap-3 p-4">
                    <span className="min-w-0">
                      <Badge tone="muted">🔒 {t.level === "hint" ? "A hint" : "An answer"}</Badge>
                      <span className="mt-1 block font-semibold text-ink">{found.question.prompt}</span>
                    </span>
                    <Link href={`/us/questions/${found.section.key}/`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">
                      Answer it
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {data.data && !shares.length && !teasers.length && !theirs ? (
        <EmptyState emoji="🌱" title={`${name} hasn't shared anything yet`} body={`When ${name} shares a hint or an answer with their Buddy, it shows up here once you've answered the same question.`} />
      ) : null}

      <Card className="mt-6" aria-labelledby="distant-title">
        <h2 id="distant-title" className="text-lg font-bold text-ink">Feeling a bit distant?</h2>
        {mine ? (
          <>
            <p className="mt-1 text-sm text-ink">
              You let {name} know. It fades on {formatDate(toISODate(addDays(new Date(mine.raisedAt), FLAG_DAYS)))}, or clear it whenever you like.
            </p>
            <Button variant="secondary" className="mt-3" loading={flag.pending} onClick={() => void flag.run(false)}>
              I&apos;m feeling better
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Let {name} know, gently. {name} sees it, and any hints you set for this moment show up for {name}. It fades after two weeks.</p>
            <Button variant="secondary" className="mt-3" loading={flag.pending} onClick={() => void flag.run(true)}>
              I&apos;m feeling a bit distant
            </Button>
          </>
        )}
        {flag.error ? <Notice tone="danger" className="mt-2" title={flag.error} /> : null}
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/us/buddy/sharing/" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline">Choose what you share</Link>
        {" · "}
        <Link href={`/us/questions/attachment/`} className="inline-flex min-h-11 items-center font-semibold text-accent-text underline">Make your own pattern card</Link>
      </p>
    </>
  );
}
