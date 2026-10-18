import { attention } from "@/lib/backend/live/attention";

const h = vi.hoisted(() => {
  type TestSession = { user: { id: string }; access_token: string } | null;
  const signal = { id: "signal-1", couple_id: "couple-a", author_id: "user-a", subject: "partner", created_at: "2026-10-18T12:00:00Z", acknowledged_at: null, resolved_at: null };
  const state = {
    session: { user: { id: "user-a" }, access_token: "test-token-a" } as TestSession,
    requests: [] as Array<{ table?: string; rpc?: string; args?: unknown; filters: Array<[string, unknown]>; headers: Record<string, string> }>,
    channelFilter: null as Record<string, string> | null,
    changed: null as (() => void) | null,
    status: null as ((value: string) => void) | null,
    authChanged: null as ((event: string, session: TestSession) => void) | null,
    fail: false,
  };
  const unsubscribe = vi.fn();
  const removeChannel = vi.fn(async () => "ok");
  const channel = {
    on: vi.fn((_event: string, filter: Record<string, string>, callback: () => void) => {
      state.channelFilter = filter; state.changed = callback; return channel;
    }),
    subscribe: vi.fn((callback: (value: string) => void) => { state.status = callback; return channel; }),
  };
  const query = (table?: string, rpc?: string, args?: unknown) => {
    const request = { table, rpc, args, filters: [] as Array<[string, unknown]>, headers: {} as Record<string, string> };
    state.requests.push(request);
    const q = {
      select: (_columns: string) => q,
      eq: (field: string, value: unknown) => { request.filters.push([field, value]); return q; },
      is: (field: string, value: unknown) => { request.filters.push([field, value]); return q; },
      order: (_field: string, _options?: unknown) => q,
      setHeader: (field: string, value: string) => { request.headers[field] = value; return q; },
      maybeSingle: () => q,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({
        data: table === "couple_members" ? { couple_id: "couple-a" } : table === "attention_signals" ? [signal] : null,
        error: state.fail ? { code: "XX000" } : null,
      }).then(resolve, reject),
    };
    return q;
  };
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
      onAuthStateChange: vi.fn((callback: typeof state.authChanged) => { state.authChanged = callback; return { data: { subscription: { unsubscribe } } }; }),
    },
    from: (table: string) => query(table),
    rpc: (rpc: string, args: unknown) => query(undefined, rpc, args),
    channel: vi.fn(() => channel),
    removeChannel,
  };
  return { state, client, unsubscribe, removeChannel };
});

vi.mock("@/lib/backend/live/client", () => ({
  supabase: () => h.client,
  fail: (_error: unknown, fallback: string) => { throw new Error(fallback); },
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.state.session = { user: { id: "user-a" }, access_token: "test-token-a" };
  h.state.requests = [];
  h.state.channelFilter = null;
  h.state.changed = null;
  h.state.status = null;
  h.state.authChanged = null;
  h.state.fail = false;
});

it("fetches only active signals for the signed-in couple and maps metadata", async () => {
  expect(await attention.list()).toEqual([{ id: "signal-1", coupleId: "couple-a", authorId: "user-a", subject: "partner", createdAt: "2026-10-18T12:00:00Z", acknowledgedAt: null, resolvedAt: null }]);
  expect(h.state.requests[0]!.filters).toContainEqual(["user_id", "user-a"]);
  expect(h.state.requests[1]!.filters).toEqual([["couple_id", "couple-a"], ["resolved_at", null]]);
  for (const request of h.state.requests) expect(request.headers.Authorization).toBe("Bearer test-token-a");
});

it("sends only the subject or signal id to the narrow RPCs", async () => {
  await attention.raise("self", "user-a");
  await attention.acknowledge("signal-1", "user-a");
  await attention.resolve("signal-1", "user-a");
  expect(h.state.requests.map(({ rpc, args }) => ({ rpc, args }))).toEqual([
    { rpc: "raise_attention", args: { p_subject: "self" } },
    { rpc: "acknowledge_attention", args: { p_id: "signal-1" } },
    { rpc: "resolve_attention", args: { p_id: "signal-1" } },
  ]);
});

it("pins an in-flight mutation to its starting session instead of the next viewer", async () => {
  h.client.auth.getSession.mockImplementationOnce(async () => {
    const starting = h.state.session;
    h.state.session = { user: { id: "user-b" }, access_token: "test-token-b" };
    return { data: { session: starting }, error: null };
  });
  await attention.raise("partner", "user-a");
  expect(h.state.requests[0]!.headers.Authorization).toBe("Bearer test-token-a");
});

it.each(["raise", "acknowledge", "resolve"] as const)("rejects %s when the captured session belongs to a different viewer", async (operation) => {
  h.state.session = { user: { id: "user-b" }, access_token: "test-token-b" };
  const pending = operation === "raise"
    ? attention.raise("self", "user-a")
    : attention[operation]("signal-1", "user-a");
  await expect(pending).rejects.toThrow(/account changed/);
  expect(h.state.requests).toHaveLength(0);
});

it("does not submit the rest of an earlier viewer's batch after a real session switch", async () => {
  await attention.raise("self", "user-a");
  h.state.session = { user: { id: "user-b" }, access_token: "test-token-b" };
  await expect(attention.raise("partner", "user-a")).rejects.toThrow(/account changed/);
  expect(h.state.requests).toHaveLength(1);
  expect(h.state.requests[0]!.args).toEqual({ p_subject: "self" });
  expect(h.state.requests[0]!.headers.Authorization).toBe("Bearer test-token-a");
});

it("rejects signed-out mutations and surfaces failed persistence", async () => {
  h.state.session = null;
  await expect(attention.raise("self", "user-a")).rejects.toThrow(/sign in/);
  expect(h.state.requests).toHaveLength(0);
  h.state.session = { user: { id: "user-a" }, access_token: "test-token-a" };
  h.state.fail = true;
  await expect(attention.raise("self", "user-a")).rejects.toThrow(/Could not update/);
});

it("subscribes only to this couple, refreshes after reconnect and removes the channel", async () => {
  const changed = vi.fn();
  const stop = attention.subscribe(changed);
  await vi.waitFor(() => expect(h.state.channelFilter).not.toBeNull());
  expect(h.state.channelFilter).toEqual({ event: "*", schema: "public", table: "attention_signals", filter: "couple_id=eq.couple-a" });
  h.state.changed!();
  h.state.status!("SUBSCRIBED");
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
  h.state.changed!();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(h.removeChannel).toHaveBeenCalledTimes(1);
  expect(h.unsubscribe).toHaveBeenCalledTimes(1);
});

it("closes the old subscription when the signed-in account changes", async () => {
  const changed = vi.fn();
  const stop = attention.subscribe(changed);
  await vi.waitFor(() => expect(h.state.authChanged).not.toBeNull());
  h.state.authChanged!("SIGNED_IN", { user: { id: "user-b" }, access_token: "test-token-b" });
  expect(h.removeChannel).toHaveBeenCalledTimes(1);
  h.state.changed?.();
  expect(changed).not.toHaveBeenCalled();
  stop();
});

it("does not create a subscription after cleanup during async initialization", async () => {
  const stop = attention.subscribe(vi.fn());
  stop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(h.client.channel).not.toHaveBeenCalled();
});
