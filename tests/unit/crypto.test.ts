import { aad, createSealer, parseMasterKey, scopes } from "@shared/crypto.ts";
import { randomBytes } from "node:crypto";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const alex = "11111111-1111-4111-8111-111111111111";
const sam = "22222222-2222-4222-8222-222222222222";

describe("answer encryption", () => {
  const sealer = createSealer(KEY);

  it("round-trips text and never stores the plaintext", async () => {
    const secret = "What helps me trust is when plans are kept.";
    const ct = await sealer.encrypt(secret, scopes.user(alex), aad.privateAnswer(alex, "trust_helps"));
    expect(ct.startsWith("v1.")).toBe(true);
    expect(ct).not.toContain("trust");
    expect(await sealer.decrypt(ct, scopes.user(alex), aad.privateAnswer(alex, "trust_helps"))).toBe(secret);
  });

  it("uses a fresh IV, so equal answers never produce equal ciphertext", async () => {
    const a = await sealer.encrypt("same", scopes.user(alex), "x");
    const b = await sealer.encrypt("same", scopes.user(alex), "x");
    expect(a).not.toBe(b);
  });

  it("cannot be opened with another user's key scope", async () => {
    const ct = await sealer.encrypt("private", scopes.user(alex), aad.privateAnswer(alex, "q"));
    await expect(sealer.decrypt(ct, scopes.user(sam), aad.privateAnswer(alex, "q"))).rejects.toThrow("Decryption failed");
  });

  it("cannot be replayed into a different row (associated data binding)", async () => {
    const ct = await sealer.encrypt("private", scopes.user(alex), aad.privateAnswer(alex, "q1"));
    await expect(sealer.decrypt(ct, scopes.user(alex), aad.privateAnswer(alex, "q2"))).rejects.toThrow("Decryption failed");
  });

  it("detects tampering", async () => {
    const ct = await sealer.encrypt("private", scopes.couple("c"), "a");
    const parts = ct.split(".");
    const body = parts[2]!;
    const flipped = (body.startsWith("A") ? "B" : "A") + body.slice(1);
    await expect(sealer.decrypt(`${parts[0]}.${parts[1]}.${flipped}`, scopes.couple("c"), "a")).rejects.toThrow();
  });

  it("fails with a different master key and leaks nothing in the error", async () => {
    const ct = await sealer.encrypt("very secret words", scopes.couple("c"), "a");
    const other = createSealer(OTHER_KEY);
    await expect(other.decrypt(ct, scopes.couple("c"), "a")).rejects.toThrow(/^Decryption failed$/);
  });

  it("round-trips JSON for multi-answer payloads", async () => {
    const answers = { best: "Our hike", more: "Sunday mornings" };
    const ct = await sealer.encryptJson(answers, scopes.couple("c"), aad.checkinResponse("k", alex));
    expect(await sealer.decryptJson(ct, scopes.couple("c"), aad.checkinResponse("k", alex))).toEqual(answers);
  });

  it("rejects missing or weak master keys", () => {
    expect(() => parseMasterKey("")).toThrow(/not set/);
    expect(() => parseMasterKey(undefined)).toThrow(/not set/);
    expect(() => parseMasterKey(Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });

  it("rejects unknown formats", async () => {
    await expect(sealer.decrypt("plaintext", scopes.user(alex), "a")).rejects.toThrow(/format/);
    await expect(sealer.decrypt("v2.a.b", scopes.user(alex), "a")).rejects.toThrow(/format/);
  });
});
