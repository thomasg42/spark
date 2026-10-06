/**
 * Reads a local clip's length with a hidden, detached <video> element
 * (loadedmetadata). Browser only. Resolves null when the length can't be read
 * (unsupported codec, timeout); callers treat null as "unknown, allowed".
 */
export function probeVideoSeconds(src: string, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.ondurationchange = null;
      video.onerror = null;
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // ignore
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onerror = () => finish(null);
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return finish(video.duration);
      // Some recorded WebM clips report Infinity until the browser seeks to the end.
      video.ondurationchange = () => {
        if (Number.isFinite(video.duration)) finish(video.duration);
      };
      try {
        video.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        finish(null);
      }
    };
    video.src = src;
  });
}
