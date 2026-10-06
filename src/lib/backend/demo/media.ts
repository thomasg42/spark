/**
 * Demo media: uploaded photos and clips are kept in this browser's IndexedDB
 * (never uploaded anywhere). Seed images are inline SVG illustrations.
 */
import { checkUpload } from "@/lib/media-rules";
import { UserFacingError, type Backend } from "../types";
import { myCouple, newId } from "./store";

const DB_NAME = "spark-demo-media";
const STORE = "files";
const memory = new Map<string, Blob>();
const objectUrls = new Map<string, string>();

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${body}</svg>`)}`;

const INLINE: Record<string, string> = {
  "demo/inline/sunset.svg": svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B2A86"/><stop offset=".55" stop-color="#E85D75"/><stop offset="1" stop-color="#F4A06B"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="200" cy="200" r="60" fill="#FFE3B3"/><path d="M0 230 Q100 200 200 228 T400 222 V300 H0Z" fill="#2B1B2E" opacity=".85"/>`,
  ),
  "demo/inline/trivia.svg": svg(
    `<rect width="400" height="300" fill="#FFF8F0"/><rect x="40" y="40" width="320" height="220" rx="24" fill="#5B2A86"/><text x="200" y="140" font-family="ui-rounded, system-ui" font-size="44" fill="#FFF8F0" text-anchor="middle">Trivia</text><text x="200" y="195" font-family="ui-rounded, system-ui" font-size="28" fill="#F59AAB" text-anchor="middle">Round 3 · Geography</text>`,
  ),
};

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function put(key: string, blob: Blob) {
  memory.set(key, blob);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getBlob(key: string): Promise<Blob | null> {
  if (memory.has(key)) return memory.get(key)!;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const media: Backend["media"] = {
  async upload(file, folder) {
    const problem = checkUpload(file, folder === "moments" ? "media" : "photo");
    if (problem) throw new UserFacingError(problem);
    const couple = myCouple();
    const path = `${couple.id}/${folder}/${newId()}`;
    await put(path, file);
    return path;
  },
  async url(path) {
    if (INLINE[path]) return INLINE[path]!;
    if (objectUrls.has(path)) return objectUrls.get(path)!;
    const blob = await getBlob(path);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.set(path, url);
    return url;
  },
  async remove(path) {
    memory.delete(path);
    const url = objectUrls.get(path);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(path);
    const db = await openDb();
    if (!db) return;
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).delete(path);
    } catch {
      // ignore
    }
  },
};
