"use client";
/**
 * One moment in the feed. Links never embed or fetch anything: they show the
 * platform and domain and open in a new tab without a referrer.
 */
import { useEffect, useId, useRef, useState } from "react";
import { StoredMedia } from "@/components/stored-image";
import { Avatar, Badge, Button } from "@/components/ui";
import { messageOf, type Moment, type Reaction } from "@/lib/backend/types";
import { cx } from "@/lib/ui/cx";
import { linkInfo, relativeTime } from "./helpers";
import { ReactionBar } from "./reaction-bar";

const NOUN: Record<Moment["kind"], string> = { photo: "photo", video: "clip", link: "link", note: "note" };
const KIND_LABEL: Record<Moment["kind"], string> = { photo: "Photo", video: "Clip", link: "Link", note: "Note" };

export function MomentCard({
  moment,
  meId,
  authorName,
  avatarName,
  nameOf,
  now,
  isNew,
  fresh = false,
  index = 0,
  onReact,
  onDelete,
}: {
  moment: Moment;
  meId: string;
  /** "You" for the viewer's own moments. */
  authorName: string;
  /** Real name for the avatar initial. */
  avatarName: string;
  nameOf: (userId: string) => string;
  now: Date;
  isNew: boolean;
  /** Just sent from this device: pops in. */
  fresh?: boolean;
  index?: number;
  onReact: (reaction: Reaction | null) => void;
  /** Resolves when deleted; rejects with a friendly error. */
  onDelete: () => Promise<void>;
}) {
  const headingId = useId();
  const mine = moment.authorId === meId;
  const noun = NOUN[moment.kind];
  const label = mine ? `Your ${noun}` : `${KIND_LABEL[moment.kind]} from ${authorName}`;

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const wasConfirming = useRef(false);

  // Move focus into the inline confirm, and back to the trigger when it closes.
  useEffect(() => {
    if (confirming) confirmRef.current?.querySelector<HTMLElement>("[data-keep]")?.focus();
    else if (wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (e) {
      setDeleteError(messageOf(e));
      setDeleting(false);
    }
  };

  const link = moment.kind === "link" ? linkInfo(moment.linkUrl) : null;
  const created = new Date(moment.createdAt);

  return (
    <li className={fresh ? "pop" : "fade-up"} style={fresh ? undefined : { animationDelay: `${Math.min(index, 6) * 45}ms` }}>
      <article
        aria-label={label}
        className={cx(
          "rounded-[var(--radius-card)] border bg-surface p-4 shadow-[0_1px_2px_rgba(43,27,46,0.06)]",
          isNew ? "border-accent" : "border-line",
        )}
      >
        <header className="mb-3 flex items-center gap-3">
          <Avatar name={avatarName} />
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="truncate text-base font-bold text-ink">
              {authorName}
            </h3>
            <p className="text-sm text-muted">
              <time dateTime={moment.createdAt} title={Number.isNaN(created.getTime()) ? undefined : created.toLocaleString()}>
                {relativeTime(moment.createdAt, now)}
              </time>
              <span aria-hidden> · </span>
              <span aria-hidden>{KIND_LABEL[moment.kind]}</span>
            </p>
          </div>
          {isNew ? <Badge>New</Badge> : null}
        </header>

        {moment.kind === "photo" && moment.mediaPath ? (
          <div className="overflow-hidden rounded-2xl bg-surface-2">
            <StoredMedia path={moment.mediaPath} mime={moment.mediaMime} alt={mine ? "Your photo" : `Photo from ${authorName}`} className="max-h-[75vh] min-h-40 w-full object-contain!" />
          </div>
        ) : null}

        {moment.kind === "video" && moment.mediaPath ? (
          <div className="overflow-hidden rounded-2xl bg-surface-2">
            <StoredMedia path={moment.mediaPath} mime={moment.mediaMime} alt={mine ? "Your clip" : `Clip from ${authorName}`} className="max-h-[75vh] min-h-40 w-full" />
          </div>
        ) : null}

        {moment.kind === "link" ? (
          link ? (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 transition hover:border-accent motion-reduce:transition-none"
            >
              <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent-text">
                {link.platform.glyph}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{link.platform.id === "other" ? link.domain : `${link.platform.label} · ${link.domain}`}</span>
                <span className="block truncate text-sm text-muted">{link.path || link.domain}</span>
              </span>
              <span aria-hidden className="text-lg text-accent-text">
                ↗
              </span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <p className="rounded-2xl border border-line bg-surface-2 p-3 text-sm text-muted">This link can't be opened.</p>
          )
        ) : null}

        {moment.kind === "note" ? (
          <p className="whitespace-pre-wrap break-words rounded-2xl bg-accent-soft px-4 py-5 font-display text-xl leading-snug text-ink">{moment.caption}</p>
        ) : moment.caption ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-ink">{moment.caption}</p>
        ) : null}

        <ReactionBar reactions={moment.reactions} meId={meId} nameOf={nameOf} onReact={onReact} label={mine ? `React to your ${noun}` : `React to ${authorName}'s ${noun}`} />

        {mine ? (
          confirming ? (
            <div
              ref={confirmRef}
              role="group"
              aria-label="Confirm delete"
              className="pop mt-3 rounded-2xl border border-line bg-surface-2 p-3"
              onKeyDown={(e) => {
                if (e.key === "Escape" && !deleting) setConfirming(false);
              }}
            >
              <p className="text-sm font-semibold text-ink">Delete this for both of you?</p>
              <p className="text-sm text-muted">It can't be undone.</p>
              {deleteError ? (
                <p role="alert" className="mt-1 text-sm font-medium text-danger">
                  {deleteError}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="danger" loading={deleting} onClick={confirmDelete}>
                  Delete
                </Button>
                <Button variant="secondary" data-keep disabled={deleting} onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex justify-end">
              <button ref={triggerRef} type="button" onClick={() => setConfirming(true)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted hover:text-danger">
                Delete<span className="sr-only"> {label.toLowerCase()}</span>
              </button>
            </div>
          )
        ) : null}
      </article>
    </li>
  );
}
