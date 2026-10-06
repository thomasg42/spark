"use client";
import { useEffect, useState } from "react";
import { useApp } from "./app-provider";
import { cx } from "@/lib/ui/cx";

/** Shows a photo or clip from the couple's private storage via a short-lived URL. */
export function StoredMedia({ path, mime, alt, className }: { path: string; mime?: string | null; alt: string; className?: string }) {
  const { backend } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    backend.media
      .url(path)
      .then((u) => {
        if (!active) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [backend, path]);

  if (failed) {
    return (
      <div className={cx("flex items-center justify-center bg-surface-2 text-sm text-muted", className)} role="img" aria-label={`${alt} (unavailable)`}>
        Media unavailable
      </div>
    );
  }
  if (!url) return <div className={cx("animate-pulse bg-surface-2", className)} aria-hidden />;
  if (mime?.startsWith("video/")) {
    return <video src={url} controls playsInline preload="metadata" className={cx("bg-black", className)} aria-label={alt} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cx("object-cover", className)} loading="lazy" decoding="async" />;
}
