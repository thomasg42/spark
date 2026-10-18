// @vitest-environment jsdom
import { createDemoBackend } from "@/lib/backend/demo";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";
import type { AttentionSignal } from "@/lib/backend";

const backend = createDemoBackend();
const actAs = (id: string) => backend.demo!.actAs(id);

beforeEach(() => {
  localStorage.clear();
  demoStore.reset(false);
  actAs(DEMO_ALEX);
});

it("shares only explicit signal metadata immediately, without touching monthly answers", async () => {
  const before = JSON.stringify(demoStore.get().checkins);
  await backend.attention.raise("partner", backend.demo!.actingAs());
  actAs(DEMO_SAM);
  const [signal] = await backend.attention.list();
  expect(signal).toMatchObject({ authorId: DEMO_ALEX, subject: "partner", acknowledgedAt: null, resolvedAt: null });
  expect(Object.keys(signal!).sort()).toEqual(["id", "coupleId", "authorId", "subject", "createdAt", "acknowledgedAt", "resolvedAt"].sort());
  expect(JSON.stringify(demoStore.get().checkins)).toBe(before);
  const stored = JSON.parse(localStorage.getItem("spark-demo-v4")!);
  expect(stored.attentionSignals).toHaveLength(1);
});

it("allows one active request per author and subject, including concurrent raises", async () => {
  await Promise.all([backend.attention.raise("self", backend.demo!.actingAs()), backend.attention.raise("self", backend.demo!.actingAs())]);
  const first = (await backend.attention.list())[0]!;
  await backend.attention.raise("partner", backend.demo!.actingAs());
  expect(await backend.attention.list()).toHaveLength(2);
  actAs(DEMO_SAM);
  await backend.attention.raise("self", backend.demo!.actingAs());
  expect(await backend.attention.list()).toHaveLength(3);
  actAs(DEMO_ALEX);
  await backend.attention.resolve(first.id, backend.demo!.actingAs());
  await backend.attention.raise("self", backend.demo!.actingAs());
  expect((await backend.attention.list()).filter((s) => s.authorId === DEMO_ALEX && s.subject === "self")).toHaveLength(1);
  expect((await backend.attention.list()).some((s) => s.id === first.id)).toBe(false);
});

it("only lets the partner acknowledge and the author resolve, preserving the first timestamps", async () => {
  await backend.attention.raise("self", backend.demo!.actingAs());
  const id = (await backend.attention.list())[0]!.id;
  await expect(backend.attention.acknowledge(id, backend.demo!.actingAs())).rejects.toThrow(/not available/);
  actAs(DEMO_SAM);
  await expect(backend.attention.resolve(id, backend.demo!.actingAs())).rejects.toThrow(/not available/);
  await backend.attention.acknowledge(id, backend.demo!.actingAs());
  const first = (await backend.attention.list())[0]!;
  await backend.attention.acknowledge(id, backend.demo!.actingAs());
  expect((await backend.attention.list())[0]!.acknowledgedAt).toBe(first.acknowledgedAt);
  expect(first.acknowledgedAt).not.toBeNull();
  expect(first.resolvedAt).toBeNull();
  actAs(DEMO_ALEX);
  await backend.attention.resolve(id, backend.demo!.actingAs());
  const resolvedAt = demoStore.get().attentionSignals[0]!.resolvedAt;
  await backend.attention.resolve(id, backend.demo!.actingAs());
  expect(demoStore.get().attentionSignals[0]!.resolvedAt).toBe(resolvedAt);
  expect(await backend.attention.list()).toEqual([]);
  actAs(DEMO_SAM);
  await expect(backend.attention.acknowledge(id, backend.demo!.actingAs())).rejects.toThrow(/not available/);
});

it("rejects unknown subjects, signed-out viewers, outsiders and unpaired viewers", async () => {
  await expect(backend.attention.raise("free text" as AttentionSignal["subject"], backend.demo!.actingAs())).rejects.toThrow(/Choose yourself/);
  demoStore.update((s) => { s.signedIn = false; });
  await expect(backend.attention.list()).rejects.toThrow(/Choose a demo partner/);
  actAs("outsider");
  await expect(backend.attention.raise("self", backend.demo!.actingAs())).rejects.toThrow(/Pair with your partner/);
  actAs(DEMO_ALEX);
  demoStore.update((s) => { s.couple!.memberIds = [DEMO_ALEX]; });
  await expect(backend.attention.raise("self", backend.demo!.actingAs())).rejects.toThrow(/Pair with your partner/);
});

it("scopes reads and writes to the viewer's couple and returns defensive copies", async () => {
  await backend.attention.raise("self", backend.demo!.actingAs());
  const [signal] = await backend.attention.list();
  signal!.subject = "partner";
  expect((await backend.attention.list())[0]!.subject).toBe("self");
  demoStore.update((s) => { s.attentionSignals.push({ ...signal!, id: "foreign", coupleId: "other-couple" }); });
  expect(await backend.attention.list()).toHaveLength(1);
  await expect(backend.attention.resolve("foreign", backend.demo!.actingAs())).rejects.toThrow(/not available/);
  actAs(DEMO_SAM);
  await expect(backend.attention.acknowledge("foreign", backend.demo!.actingAs())).rejects.toThrow(/not available/);
});

it("rejects a pending raise after persona switch instead of raising for the new viewer", async () => {
  const pending = backend.attention.raise("partner", backend.demo!.actingAs());
  actAs(DEMO_SAM);
  await expect(pending).rejects.toThrow(/account changed/);
  expect(demoStore.get().attentionSignals).toEqual([]);
});

it.each(["raise", "acknowledge", "resolve"] as const)("rejects %s from a stale viewer before starting a mutation", async (operation) => {
  actAs(DEMO_SAM);
  const pending = operation === "raise"
    ? backend.attention.raise("self", DEMO_ALEX)
    : backend.attention[operation]("signal", DEMO_ALEX);
  await expect(pending).rejects.toThrow(/account changed/);
  expect(demoStore.get().attentionSignals).toEqual([]);
});

it("rejects a pending acknowledgement after switching to the author", async () => {
  await backend.attention.raise("self", backend.demo!.actingAs());
  const id = (await backend.attention.list())[0]!.id;
  actAs(DEMO_SAM);
  const pending = backend.attention.acknowledge(id, backend.demo!.actingAs());
  actAs(DEMO_ALEX);
  await expect(pending).rejects.toThrow(/account changed/);
  expect(demoStore.get().attentionSignals[0]!.acknowledgedAt).toBeNull();
});

it("notifies on writes and persona changes, never on list reads, and supports cleanup", async () => {
  const changed = vi.fn();
  const stop = backend.attention.subscribe(changed);
  await backend.attention.list();
  expect(changed).not.toHaveBeenCalled();
  await backend.attention.raise("self", backend.demo!.actingAs());
  expect(changed).toHaveBeenCalledTimes(1);
  await backend.attention.raise("self", backend.demo!.actingAs());
  expect(changed).toHaveBeenCalledTimes(1);
  actAs(DEMO_SAM);
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
  await backend.attention.raise("partner", backend.demo!.actingAs());
  expect(changed).toHaveBeenCalledTimes(2);
});

it("opens an older stored demo with an empty attention list", async () => {
  const legacy = structuredClone(demoStore.get()) as Partial<ReturnType<typeof demoStore.get>>;
  delete legacy.attentionSignals;
  localStorage.setItem("spark-demo-v4", JSON.stringify(legacy));
  vi.resetModules();
  const { demoStore: reloaded } = await import("@/lib/backend/demo/store");
  expect(reloaded.get().attentionSignals).toEqual([]);
});
