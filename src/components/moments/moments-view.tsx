"use client";
/**
 * Moments: a private feed of clips, photos, links and notes for the two of
 * them. Reactions update instantly (optimistic, saved in order per moment).
 * The "New" marker uses a per-person timestamp on this device only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, EmptyState, LoadingBlock, Notice, PageHeader, useToast } from "@/components/ui";
import { messageOf, type Moment, type Reaction } from "@/lib/backend/types";
import { useLoad } from "@/lib/ui/hooks";
import { Composer, type ComposerMode } from "./composer";
import { isNewMoment, newestTimestamp, readLastVisit, withMyReaction, writeLastVisit } from "./helpers";
import { MomentCard } from "./moment-card";

const FEED_HEADING_ID = "moments-feed-heading";

export function MomentsView() {
  const { backend, user, profile, partner, nameOf } = useApp();
  const toast = useToast();
  const meId = user?.id ?? "";
  const myName = profile?.nickname || profile?.displayName || "You";
  const partnerName = partner?.nickname || partner?.displayName || "your partner";

  const { data, setData, error, loading, reload } = useLoad(() => backend.moments.list(), [backend, meId]);

  const [mode, setMode] = useState<ComposerMode>("media");
  const [focusRequest, setFocusRequest] = useState(0);
  const [lastVisit, setLastVisit] = useState<{ userId: string; value: string | null } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => new Date());
  const [checking, setChecking] = useState(false);
  const feedHeading = useRef<HTMLHeadingElement>(null);
  const queues = useRef(new Map<string, Promise<unknown>>());
  const inflight = useRef(0);

  // This device's previous visit, read once per person. Markers stay put for the whole visit.
  useEffect(() => {
    if (meId) setLastVisit({ userId: meId, value: readLastVisit(meId) });
  }, [meId]);

  // Remember the newest moment seen (server clock, never moving backwards) for next time.
  useEffect(() => {
    if (!meId || !data || lastVisit?.userId !== meId) return;
    const newest = newestTimestamp(data);
    if (!newest) return;
    const stored = readLastVisit(meId);
    if (!stored || Date.parse(newest) > Date.parse(stored)) writeLastVisit(meId, newest);
  }, [meId, data, lastVisit]);

  // Keep "5 min ago" honest.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /** Reloads without the loading spinner; skipped while reactions are saving so they don't flicker back. */
  const refreshQuietly = useCallback(async () => {
    try {
      const list = await backend.moments.list();
      if (inflight.current === 0) setData(list);
      return true;
    } catch {
      return false;
    }
  }, [backend, setData]);

  // Coming back to the app: pick up anything new.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(new Date());
      void refreshQuietly();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshQuietly]);

  const isNew = useCallback(
    (m: Moment) => lastVisit?.userId === meId && isNewMoment(m, meId, lastVisit.value),
    [lastVisit, meId],
  );
  const newCount = useMemo(() => (data ?? []).filter(isNew).length, [data, isNew]);

  const onSent = (moment: Moment) => {
    setData((list) => [moment, ...(list ?? []).filter((m) => m.id !== moment.id)]);
    setFresh((prev) => new Set(prev).add(moment.id));
  };

  const react = (moment: Moment, reaction: Reaction | null) => {
    if (!meId) return;
    setData((list) => (list ? list.map((m) => (m.id === moment.id ? { ...m, reactions: withMyReaction(m.reactions, meId, reaction) } : m)) : list));
    inflight.current += 1;
    // Saves for one moment run in tap order, so the last tap always wins.
    const previous = queues.current.get(moment.id) ?? Promise.resolve();
    const save = previous.catch(() => undefined).then(() => backend.moments.react(moment.id, reaction));
    queues.current.set(moment.id, save);
    void save
      .then(
        () => false,
        (e: unknown) => {
          toast.show(messageOf(e, "Couldn't save that reaction."), "error");
          return true;
        },
      )
      .then((failed) => {
        inflight.current -= 1;
        if (queues.current.get(moment.id) === save) queues.current.delete(moment.id);
        if (failed) void refreshQuietly(); // put the real state back
      });
  };

  const remove = async (moment: Moment) => {
    await backend.moments.remove(moment.id);
    setData((list) => (list ? list.filter((m) => m.id !== moment.id) : list));
    toast.show("Deleted");
    feedHeading.current?.focus();
  };

  const checkForNew = async () => {
    setChecking(true);
    const ok = await refreshQuietly();
    setNow(new Date());
    setChecking(false);
    toast.show(ok ? "You're all caught up" : "Couldn't refresh. Check your connection.", ok ? "success" : "error");
  };

  const startNote = () => {
    setMode("note");
    setFocusRequest((n) => n + 1);
  };

  const nameFor = (userId: string) => nameOf(userId);

  return (
    <>
      <PageHeader title="Moments" subtitle="Just for the two of you. Share it here instead of everywhere." />

      <Composer partnerName={partnerName} mode={mode} onModeChange={setMode} focusRequest={focusRequest} onSent={onSent} />

      <section aria-labelledby={FEED_HEADING_ID} className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={FEED_HEADING_ID} ref={feedHeading} tabIndex={-1} className="text-xl font-bold text-ink">
            Your feed
          </h2>
          {data && data.length > 0 ? (
            <Button variant="ghost" className="min-h-11 px-3 text-sm" loading={checking} onClick={checkForNew}>
              Refresh
            </Button>
          ) : null}
        </div>

        {newCount > 0 ? (
          <p className="mb-3 text-sm font-semibold text-accent-text">
            <span aria-hidden className="text-deco">
              ✦{" "}
            </span>
            {newCount} new from {partnerName}
          </p>
        ) : null}

        {error && data ? (
          <Notice tone="danger" className="mb-3" title="Couldn't refresh your feed">
            {error}
          </Notice>
        ) : null}

        {loading && !data ? (
          <LoadingBlock label="Loading your moments…" />
        ) : error && !data ? (
          <Notice tone="danger" title="Couldn't load your moments">
            <p>{error}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void reload()}>
              Try again
            </Button>
          </Notice>
        ) : data && data.length === 0 ? (
          <EmptyState
            emoji="✦"
            title="Nothing here yet"
            body={`Send the first one. A photo from your day, a link that made you laugh, or a quick note just for ${partnerName}.`}
            action={
              <Button variant="secondary" onClick={startNote}>
                Start with a note
              </Button>
            }
          />
        ) : data ? (
          <ul role="list" className="space-y-4">
            {data.map((m, i) => {
              const mine = m.authorId === meId;
              return (
                <MomentCard
                  key={m.id}
                  moment={m}
                  meId={meId}
                  authorName={nameOf(m.authorId)}
                  avatarName={mine ? myName : m.authorId === partner?.userId ? partnerName : nameOf(m.authorId)}
                  nameOf={nameFor}
                  now={now}
                  isNew={isNew(m)}
                  fresh={fresh.has(m.id)}
                  index={i}
                  onReact={(reaction) => react(m, reaction)}
                  onDelete={() => remove(m)}
                />
              );
            })}
          </ul>
        ) : null}
      </section>
    </>
  );
}
