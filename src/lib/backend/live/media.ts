import { checkUpload, extensionFor } from "@/lib/media-rules";
import { UserFacingError, type Backend } from "../types";
import { requireCoupleId, supabase } from "./client";

const BUCKET = "couple-media";
const urlCache = new Map<string, { url: string; expires: number }>();

export const media: Backend["media"] = {
  async upload(file, folder) {
    const problem = checkUpload(file, folder === "moments" ? "media" : "photo");
    if (problem) throw new UserFacingError(problem);
    const coupleId = await requireCoupleId();
    const path = `${coupleId}/${folder}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
    const { error } = await supabase().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
    if (error) throw new UserFacingError("Upload failed. Check your connection and try again.");
    return path;
  },
  async url(path) {
    const cached = urlCache.get(path);
    if (cached && cached.expires > Date.now()) return cached.url;
    const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  },
  async remove(path) {
    urlCache.delete(path);
    await supabase().storage.from(BUCKET).remove([path]);
  },
};
