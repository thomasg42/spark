/**
 * Application-layer encryption for sensitive answer text.
 *
 * - AES-256-GCM with a fresh 96-bit IV per value.
 * - Keys are derived per scope with HKDF-SHA256 from the ENCRYPTION_KEY master
 *   secret, which lives only in Edge Function secrets (never in the database,
 *   never in the browser bundle):
 *     user:<uuid>    private onboarding answers (only that user can ever unlock)
 *     couple:<uuid>  monthly check-in answers and summaries (both partners, after reveal)
 * - Associated data binds each ciphertext to its row, so a value copied into a
 *   different row or column fails to decrypt instead of leaking.
 * - Format: "v1.<base64url iv>.<base64url ciphertext+tag>". The database CHECK
 *   constraints require the "v1." prefix.
 *
 * Uses only Web Crypto, so it runs unchanged in Deno (Edge Functions) and Node (tests).
 */

const VERSION = "v1";
const HKDF_SALT = new TextEncoder().encode("spark/encryption/v1");
const keyCache = new Map<string, Promise<CryptoKey>>();

export type KeyScope = `user:${string}` | `couple:${string}`;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Decodes the base64 master key and checks it carries at least 256 bits. */
export function parseMasterKey(base64: string | undefined | null): Uint8Array {
  if (!base64 || !base64.trim()) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(base64.trim().replace(/=+$/, ""));
  } catch {
    throw new Error("ENCRYPTION_KEY must be base64");
  }
  if (bytes.length < 32) {
    throw new Error("ENCRYPTION_KEY must decode to at least 32 bytes");
  }
  return bytes;
}

async function scopeKey(master: Uint8Array, scope: KeyScope): Promise<CryptoKey> {
  const cacheKey = `${toBase64Url(master)}|${scope}`;
  let pending = keyCache.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const ikm = await crypto.subtle.importKey("raw", master as BufferSource, "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: new TextEncoder().encode(scope) },
        ikm,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
    keyCache.set(cacheKey, pending);
  }
  return pending;
}

export interface Sealer {
  encrypt(plaintext: string, scope: KeyScope, aad: string): Promise<string>;
  decrypt(ciphertext: string, scope: KeyScope, aad: string): Promise<string>;
  encryptJson(value: unknown, scope: KeyScope, aad: string): Promise<string>;
  decryptJson<T>(ciphertext: string, scope: KeyScope, aad: string): Promise<T>;
}

export function createSealer(masterKeyBase64: string | undefined | null): Sealer {
  const master = parseMasterKey(masterKeyBase64);

  async function encrypt(plaintext: string, scope: KeyScope, aad: string): Promise<string> {
    const key = await scopeKey(master, scope);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`;
  }

  async function decrypt(ciphertext: string, scope: KeyScope, aad: string): Promise<string> {
    const parts = ciphertext.split(".");
    if (parts.length !== 3 || parts[0] !== VERSION) {
      throw new Error("Unsupported ciphertext format");
    }
    const key = await scopeKey(master, scope);
    try {
      const opened = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64Url(parts[1]!) as BufferSource, additionalData: new TextEncoder().encode(aad) },
        key,
        fromBase64Url(parts[2]!) as BufferSource,
      );
      return new TextDecoder().decode(opened);
    } catch {
      // Never include key material, plaintext or ciphertext in errors.
      throw new Error("Decryption failed");
    }
  }

  return {
    encrypt,
    decrypt,
    encryptJson: (value, scope, aad) => encrypt(JSON.stringify(value), scope, aad),
    decryptJson: async <T>(ciphertext: string, scope: KeyScope, aad: string) =>
      JSON.parse(await decrypt(ciphertext, scope, aad)) as T,
  };
}

/** Associated-data builders: one place defines what each ciphertext is bound to. */
export const aad = {
  privateAnswer: (userId: string, questionId: string) => `private_answers|${userId}|${questionId}`,
  checkinResponse: (checkinId: string, userId: string) => `checkin_responses|${checkinId}|${userId}`,
  checkinSummary: (checkinId: string) => `checkins.summary|${checkinId}`,
};

export const scopes = {
  user: (userId: string): KeyScope => `user:${userId}`,
  couple: (coupleId: string): KeyScope => `couple:${coupleId}`,
};
