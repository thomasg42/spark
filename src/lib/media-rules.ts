/** Upload rules shared by live and demo backends (mirrors the storage bucket limits). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB, the bucket limit
export const MAX_VIDEO_SECONDS = 60;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export function mediaKind(mime: string): "photo" | "video" | null {
  if ((IMAGE_TYPES as readonly string[]).includes(mime)) return "photo";
  if ((VIDEO_TYPES as readonly string[]).includes(mime)) return "video";
  return null;
}

/** Returns a friendly problem description, or null when the file is acceptable. */
export function checkUpload(file: { size: number; type: string }, allow: "photo" | "media" = "media"): string | null {
  const kind = mediaKind(file.type);
  if (!kind) return "That file type isn't supported. Use a photo (JPG, PNG, WebP, GIF, HEIC) or a video (MP4, MOV, WebM).";
  if (allow === "photo" && kind !== "photo") return "Please choose a photo.";
  if (file.size > MAX_UPLOAD_BYTES) return "That file is over 50 MB. Try a shorter clip or a smaller photo.";
  return null;
}

export function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  };
  return map[mime] ?? "bin";
}

/** Only https links are stored; returns the normalized URL or null. */
export function normalizeLink(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
    const out = url.toString();
    return out.length <= 2000 ? out : null;
  } catch {
    return null;
  }
}
