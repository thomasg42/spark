"use client";
/**
 * Optional photo for a story entry: pick, preview, change or remove.
 * The native file input stays in the tab order (visually hidden) and its
 * label carries the visible focus ring.
 */
import { useEffect, useId, useState, type ChangeEvent } from "react";
import { StoredMedia } from "@/components/stored-image";
import { Button } from "@/components/ui";
import { checkUpload } from "@/lib/media-rules";

const focusRing =
  "peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

/** Object URL for a local file, revoked when the file changes or the picker unmounts. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function PhotoPicker({
  existingPath,
  file,
  removed,
  title,
  error,
  disabled,
  onPick,
  onRemove,
  onError,
}: {
  /** The photo already saved on this entry, if any. */
  existingPath: string | null;
  /** A newly chosen photo that will upload on save. */
  file: File | null;
  /** True once the saved photo has been marked for removal. */
  removed: boolean;
  title: string;
  error: string | null;
  disabled?: boolean;
  onPick(file: File): void;
  onRemove(): void;
  onError(message: string | null): void;
}) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const previewUrl = useObjectUrl(file);
  const [previewFailed, setPreviewFailed] = useState(false);
  const showingSaved = !file && Boolean(existingPath) && !removed;
  const hasPhoto = Boolean(file) || showingSaved;
  const about = title.trim() ? ` for "${title.trim()}"` : "";

  useEffect(() => setPreviewFailed(false), [file]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = ""; // lets the same file be picked again after a removal
    if (!picked) return;
    const problem = checkUpload(picked, "photo");
    if (problem) {
      onError(problem);
      return;
    }
    onError(null);
    onPick(picked);
  };

  const input = (
    <input
      id={inputId}
      type="file"
      accept="image/*"
      className="peer sr-only"
      onChange={handleChange}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    />
  );

  return (
    <fieldset className="mb-4 min-w-0">
      <legend className="mb-1 text-sm font-semibold text-ink">
        Photo <span className="font-normal text-muted">(optional)</span>
      </legend>
      {hasPhoto ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
          {file ? (
            previewUrl && !previewFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`Preview of the photo you chose${about}`}
                className="pop aspect-[4/3] w-full object-cover"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 p-4 text-center text-sm text-muted">
                <span aria-hidden className="text-2xl">
                  📷
                </span>
                <span>
                  <span className="font-semibold text-ink">{file.name}</span> is ready.
                </span>
                <span>This browser can't preview it, but it will still save.</span>
              </div>
            )
          ) : existingPath ? (
            <StoredMedia path={existingPath} alt={`Saved photo${about}`} className="aspect-[4/3] w-full" />
          ) : null}
          <div className="flex flex-wrap items-center gap-2 p-3">
            {input}
            <label
              htmlFor={inputId}
              className={`inline-flex min-h-12 cursor-pointer items-center rounded-full border border-line bg-surface px-5 text-base font-semibold text-ink transition hover:bg-surface-2 ${focusRing}`}
            >
              Change photo
            </label>
            <Button variant="ghost" onClick={onRemove} disabled={disabled}>
              Remove photo
            </Button>
          </div>
        </div>
      ) : (
        <>
          {input}
          <label
            htmlFor={inputId}
            className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line bg-surface px-4 py-5 text-center transition hover:bg-surface-2 ${focusRing}`}
          >
            <span aria-hidden className="text-2xl">
              📷
            </span>
            <span className="font-semibold text-accent-text">Add a photo</span>
            <span className="text-sm text-muted">Only the two of you can see it.</span>
          </label>
        </>
      )}
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
