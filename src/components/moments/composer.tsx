"use client";
/**
 * Moments composer: Photo or clip / Link / Note, as a native radio group
 * (arrow keys move between modes). Photos and clips preview instantly from a
 * local object URL (revoked on change and unmount); clip length is checked on
 * the device before anything is uploaded.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Notice, TextAreaField, TextField } from "@/components/ui";
import { messageOf, type Moment, type MomentInput } from "@/lib/backend/types";
import { checkUpload, MAX_VIDEO_SECONDS, mediaKind } from "@/lib/media-rules";
import { cx } from "@/lib/ui/cx";
import { formatBytes, formatClipLength, linkInfo, videoLengthProblem } from "./helpers";
import { MAX_CAPTION } from "./moment-rules";
import { probeVideoSeconds } from "./video-probe";

export type ComposerMode = "media" | "link" | "note";

const MODES: Array<{ value: ComposerMode; label: string; icon: string }> = [
  { value: "media", label: "Photo or clip", icon: "📷" },
  { value: "link", label: "Link", icon: "🔗" },
  { value: "note", label: "Note", icon: "✎" },
];

const ACCEPT = "image/*,video/mp4,video/quicktime,video/webm";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export function Composer({
  partnerName,
  mode,
  onModeChange,
  focusRequest,
  onSent,
}: {
  partnerName: string;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  /** Increment to move focus to the current mode's main field. */
  focusRequest: number;
  onSent: (moment: Moment) => void;
}) {
  const { backend } = useApp();
  const titleId = useId();
  const groupName = useId();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [probing, setProbing] = useState(false);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [hasCamera, setHasCamera] = useState(false);

  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const kind = file ? mediaKind(file.type) : null;
  const link = mode === "link" ? linkInfo(url) : null;

  // Phones and tablets get a direct "Open camera" button (desktop browsers ignore capture).
  useEffect(() => {
    try {
      setHasCamera(window.matchMedia("(pointer: coarse)").matches);
    } catch {
      setHasCamera(false);
    }
  }, []);

  // Local preview + clip length check. The object URL is revoked whenever the file changes or we unmount.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setSeconds(null);
      setProbing(false);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    let active = true;
    setPreviewUrl(objectUrl);
    setPreviewBroken(false);
    setSeconds(null);
    if (mediaKind(file.type) === "video") {
      setProbing(true);
      void probeVideoSeconds(objectUrl).then((length) => {
        if (!active) return;
        setSeconds(length);
        setProbing(false);
        setFileProblem(videoLengthProblem(length));
      });
    } else {
      setProbing(false);
    }
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  // Clear the "Sent" confirmation after a few seconds.
  useEffect(() => {
    if (!status.startsWith("Sent")) return;
    const timer = setTimeout(() => setStatus(""), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  // Runs only when a focus is requested (not on every mode change, so arrow keys stay on the radios).
  useEffect(() => {
    if (!focusRequest) return;
    const el = panelRef.current?.querySelector<HTMLElement>("[data-composer-focus]");
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [focusRequest]);

  const changeMode = (next: ComposerMode) => {
    setFieldError(null);
    setError(null);
    setStatus("");
    onModeChange(next);
  };

  const pickFile = (input: HTMLInputElement) => {
    const next = input.files?.[0] ?? null;
    input.value = ""; // lets the same file be picked again later
    if (!next) return;
    setError(null);
    setStatus("");
    const problem = checkUpload(next, "media");
    if (problem) {
      setFile(null);
      setFileProblem(problem);
      return;
    }
    setFileProblem(null);
    setFile(next);
  };

  const clearFile = () => {
    setFile(null);
    setFileProblem(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || probing) return;
    setError(null);
    setFieldError(null);
    setStatus("");

    let input: MomentInput;
    let noun: string;
    if (mode === "media") {
      if (!file || !kind) {
        setFileProblem((current) => current ?? "Choose a photo or clip first.");
        return;
      }
      if (fileProblem) return;
      input = { kind, file, caption };
      noun = kind === "video" ? "clip" : "photo";
    } else if (mode === "link") {
      const info = linkInfo(url);
      if (!info) {
        setFieldError(url.trim() ? "That doesn't look like a link. Try pasting the full address." : "Paste a link first.");
        return;
      }
      input = { kind: "link", url: info.url, caption };
      noun = "link";
    } else {
      if (!caption.trim()) {
        setFieldError("Write a little something first.");
        return;
      }
      input = { kind: "note", caption };
      noun = "note";
    }

    setPending(true);
    setStatus(noun === "clip" ? "Sending your clip. Longer clips can take a moment." : `Sending your ${noun}…`);
    try {
      const moment = await backend.moments.add(input);
      onSent(moment);
      setCaption("");
      setUrl("");
      clearFile();
      setStatus(`Sent to ${partnerName}.`);
    } catch (e) {
      setStatus("");
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby={titleId} className="fade-up rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(43,27,46,0.06)] sm:p-5">
      <h2 id={titleId} className="text-lg font-bold text-ink">
        Send {partnerName} something
      </h2>
      <form onSubmit={submit} noValidate className="mt-3">
        <fieldset className="mb-4">
          <legend className="sr-only">What are you sending?</legend>
          <div className="grid grid-cols-3 gap-1 rounded-full border border-line bg-surface-2 p-1">
            {MODES.map((m) => (
              <label key={m.value} className="min-w-0">
                <input type="radio" name={groupName} value={m.value} checked={mode === m.value} onChange={() => changeMode(m.value)} className="peer sr-only" />
                <span
                  className={cx(
                    "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-center text-sm font-semibold leading-tight text-muted transition motion-reduce:transition-none",
                    "peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm",
                    "peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]",
                  )}
                >
                  <span aria-hidden>{m.icon}</span>
                  {m.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div ref={panelRef} key={mode} className="fade-up">
          {mode === "media" ? (
            <div className="mb-4">
              <input ref={libraryInput} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Photo or clip from your device" onChange={(e) => pickFile(e.currentTarget)} />
              <input ref={cameraInput} type="file" accept={ACCEPT} capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo or clip" onChange={(e) => pickFile(e.currentTarget)} />
              {file && previewUrl ? (
                <div className="pop overflow-hidden rounded-2xl border border-line bg-surface-2">
                  {kind === "video" ? (
                    <video src={previewUrl} controls playsInline muted preload="metadata" aria-label="Preview of your clip" className="max-h-80 w-full bg-surface-2" />
                  ) : previewBroken ? (
                    <div className="flex min-h-36 items-center justify-center px-4 text-center text-sm text-muted">This photo can't be previewed in this browser, but it will still send.</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Preview of your photo" className="max-h-80 w-full object-contain" onError={() => setPreviewBroken(true)} />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate text-muted">
                      {kind === "video" ? "Clip" : "Photo"} · {formatBytes(file.size)}
                      {kind === "video" ? (probing ? " · checking length…" : seconds != null && Number.isFinite(seconds) ? ` · ${formatClipLength(seconds)}` : "") : ""}
                    </span>
                    <span className="flex gap-1">
                      <button type="button" data-composer-focus onClick={() => libraryInput.current?.click()} className="min-h-11 rounded-full px-3 font-semibold text-accent-text hover:bg-accent-soft">
                        Change
                      </button>
                      <button type="button" onClick={clearFile} className="min-h-11 rounded-full px-3 font-semibold text-muted hover:bg-surface">
                        Remove
                      </button>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <button
                    type="button"
                    data-composer-focus
                    onClick={() => libraryInput.current?.click()}
                    className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-4 py-5 text-center transition hover:border-accent motion-reduce:transition-none"
                  >
                    <span aria-hidden className="text-3xl">
                      📷
                    </span>
                    <span className="font-semibold text-ink">Choose a photo or clip</span>
                    <span className="text-sm text-muted">Clips up to {MAX_VIDEO_SECONDS} seconds, files up to 50 MB</span>
                  </button>
                  {hasCamera ? (
                    <Button variant="secondary" onClick={() => cameraInput.current?.click()}>
                      <span aria-hidden>◉</span> Open camera
                    </Button>
                  ) : null}
                </div>
              )}
              {fileProblem ? (
                <p role="alert" className="mt-2 text-sm font-medium text-danger">
                  {fileProblem}
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === "link" ? (
            <>
              <TextField
                label="Link"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="Paste a link"
                maxLength={2000}
                value={url}
                onChange={(v) => {
                  setUrl(v);
                  setFieldError(null);
                }}
                hint="It opens in your browser. Spark doesn't load previews or players from other sites."
                error={fieldError}
                data-composer-focus
              />
              <p aria-live="polite" className="-mt-2 mb-4 min-h-7 text-sm">
                {link ? (
                  <span className="pop inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent-text">
                    <span aria-hidden>{link.platform.glyph}</span>
                    <span className="truncate">{link.platform.id === "other" ? `Link to ${link.domain}` : `${link.platform.label} link`}</span>
                  </span>
                ) : null}
              </p>
            </>
          ) : null}

          <TextAreaField
            label={mode === "note" ? "Your note" : "Caption"}
            optional={mode !== "note"}
            rows={mode === "note" ? 3 : 2}
            maxLength={MAX_CAPTION}
            placeholder={mode === "note" ? "Saw something that made me think of you…" : mode === "link" ? "This is so us" : "Add a caption"}
            value={caption}
            onChange={(v) => {
              setCaption(v);
              if (mode === "note") setFieldError(null);
            }}
            error={mode === "note" ? fieldError : null}
            {...(mode === "note" ? { "data-composer-focus": true } : {})}
          />
        </div>

        {error ? (
          <Notice tone="danger" className="mb-3" title="That didn't send">
            {error}
          </Notice>
        ) : null}

        <Button type="submit" loading={pending} disabled={probing} className="w-full sm:w-auto">
          {pending ? "Sending…" : `Send to ${partnerName}`}
        </Button>
        <p role="status" className="mt-2 min-h-5 text-sm font-medium text-accent-text">
          {status}
        </p>
      </form>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
        <span aria-hidden>🔒</span>
        <span>Only you and {partnerName} can see this. No public sharing, no forwarding.</span>
      </p>
    </section>
  );
}
