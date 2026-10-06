/**
 * Validation shared by the live and demo Moments backends, so both accept and
 * reject exactly the same input (and match the database CHECK constraints).
 * Pure module: no React, no DOM, safe to import from anywhere.
 */
import { UserFacingError, type MomentInput, type Reaction } from "@/lib/backend/types";
import { checkUpload, mediaKind, normalizeLink } from "@/lib/media-rules";

/** Mirrors moments.caption CHECK (char_length <= 500). */
export const MAX_CAPTION = 500;

/** Mirrors moment_reactions.reaction CHECK. Display order for the reaction bar. */
export const REACTION_VALUES: readonly Reaction[] = ["heart", "laugh", "fire", "wow", "hug"];

export function isReaction(value: unknown): value is Reaction {
  return typeof value === "string" && (REACTION_VALUES as readonly string[]).includes(value);
}

export type PreparedMoment =
  | { kind: "photo" | "video"; caption: string | null; file: File; mime: string }
  | { kind: "link"; caption: string | null; linkUrl: string }
  | { kind: "note"; caption: string };

/** Trims a caption; empty becomes null. Throws when it is too long. */
export function cleanCaption(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (text.length > MAX_CAPTION) throw new UserFacingError(`Keep it to ${MAX_CAPTION} characters or less.`);
  return text;
}

/**
 * Checks and normalizes a new moment. For photos and clips the real file type
 * decides the kind (a clip picked in "photo" mode is stored as a video).
 */
export function prepareMoment(input: MomentInput): PreparedMoment {
  switch (input?.kind) {
    case "photo":
    case "video": {
      const file = input.file;
      if (!file) throw new UserFacingError("Choose a photo or clip first.");
      const problem = checkUpload(file, "media");
      if (problem) throw new UserFacingError(problem);
      const kind = mediaKind(file.type);
      if (!kind) throw new UserFacingError("That file type isn't supported.");
      return { kind, caption: cleanCaption(input.caption), file, mime: file.type };
    }
    case "link": {
      const linkUrl = normalizeLink(input.url ?? "");
      if (!linkUrl) throw new UserFacingError("That link doesn't look right. Paste the full address, like https://example.com.");
      return { kind: "link", caption: cleanCaption(input.caption), linkUrl };
    }
    case "note": {
      const caption = cleanCaption(input.caption);
      if (!caption) throw new UserFacingError("Write a little something first.");
      return { kind: "note", caption };
    }
    default:
      throw new UserFacingError("That kind of moment isn't supported.");
  }
}
