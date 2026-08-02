import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

// Mock the anon-key Realtime client boundary — lib/realtime.ts must never talk
// to a live socket in unit tests; we verify it drives the supabase-js surface
// (channel/on/subscribe/track/send/presenceState/removeChannel) correctly.
vi.mock("./supabase/client", () => ({
  createRealtimeClient: vi.fn(),
}));

type ChannelStatusCallback = (
  status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED",
  err?: Error
) => void;

interface FakeBinding {
  type: string;
  filter: { event: string };
  callback: (payload: unknown) => void;
}

function createFakeChannel(topic: string, config: unknown) {
  const bindings: FakeBinding[] = [];
  // Mirrors the real @supabase/realtime-js RealtimeChannel.on() constraint
  // (verified against the installed node_modules/@supabase/realtime-js
  // source): calling `.on("presence" | "postgres_changes", ...)` throws
  // once the channel is joined/joining. `.on("broadcast", ...)` has no such
  // restriction. Without modeling this, a test could pass against the fake
  // while still throwing in a real browser.
  let joined = false;
  const channel = {
    topic,
    config,
    bindings,
    on: vi.fn((type: string, filter: { event: string }, callback: (payload: unknown) => void) => {
      if (joined && (type === "presence" || type === "postgres_changes")) {
        throw new Error(`cannot add \`${type}\` callbacks for ${topic} after \`subscribe()\`.`);
      }
      bindings.push({ type, filter, callback });
      return channel;
    }),
    subscribe: vi.fn((callback?: ChannelStatusCallback) => {
      joined = true;
      callback?.("SUBSCRIBED");
      return channel;
    }),
    track: vi.fn().mockResolvedValue("ok"),
    send: vi.fn().mockResolvedValue("ok"),
    presenceState: vi.fn().mockReturnValue({}),
    unsubscribe: vi.fn().mockResolvedValue("ok"),
  };
  return channel;
}

function createFakeSupabase() {
  const channels = new Map<string, ReturnType<typeof createFakeChannel>>();
  const supabase = {
    channel: vi.fn((topic: string, opts: { config: unknown }) => {
      const channel = createFakeChannel(topic, opts.config);
      channels.set(topic, channel);
      return channel;
    }),
    realtime: {
      setAuth: vi.fn().mockResolvedValue(undefined),
    },
    removeChannel: vi.fn().mockResolvedValue("ok"),
  };
  return { supabase, channels };
}

describe("lib/realtime", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup() {
    const { supabase, channels } = createFakeSupabase();
    const clientModule = await import("./supabase/client");
    vi.mocked(clientModule.createRealtimeClient).mockReturnValue(
      supabase as unknown as SupabaseClient<Database>
    );
    const realtime = await import("./realtime");
    return { realtime, supabase, channels };
  }

  // realtime.getSessionChannel()'s declared return type is the real
  // supabase-js RealtimeChannel, but at runtime (mocked) it's our fake
  // channel shape — this cast lets tests reach `.bindings`/mock helpers
  // without fighting the real class's (mostly-private) type surface.
  function asFake(
    channel: unknown
  ): ReturnType<typeof createFakeChannel> {
    return channel as ReturnType<typeof createFakeChannel>;
  }

  it("getSessionChannel creates a private channel scoped to session:{id}", async () => {
    const { realtime, supabase } = await setup();
    const sessionId = "11111111-1111-1111-1111-111111111111";

    const channel = realtime.getSessionChannel(sessionId);

    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledWith(
      `session:${sessionId}`,
      expect.objectContaining({
        config: expect.objectContaining({ private: true }),
      })
    );
    expect(channel.topic).toBe(`session:${sessionId}`);
  });

  it("getSessionChannel memoizes per sessionId (lazy singleton)", async () => {
    const { realtime, supabase } = await setup();
    const sessionId = "22222222-2222-2222-2222-222222222222";

    const first = realtime.getSessionChannel(sessionId);
    const second = realtime.getSessionChannel(sessionId);

    expect(first).toBe(second);
    expect(supabase.channel).toHaveBeenCalledTimes(1);
  });

  it("getSessionChannel creates distinct channels for distinct session ids", async () => {
    const { realtime, supabase } = await setup();

    const a = realtime.getSessionChannel("33333333-3333-3333-3333-333333333333");
    const b = realtime.getSessionChannel("44444444-4444-4444-4444-444444444444");

    expect(a).not.toBe(b);
    expect(supabase.channel).toHaveBeenCalledTimes(2);
  });

  it("setRealtimeAuth awaits the realtime client's setAuth with the given token", async () => {
    const { realtime, supabase } = await setup();

    await realtime.setRealtimeAuth("a-token");

    expect(supabase.realtime.setAuth).toHaveBeenCalledWith("a-token");
  });

  it("trackPresence subscribes the channel (if needed) then tracks the given state", async () => {
    const { realtime } = await setup();
    const sessionId = "55555555-5555-5555-5555-555555555555";
    const channel = realtime.getSessionChannel(sessionId);

    await realtime.trackPresence(sessionId, {
      participantId: "p1",
      displayName: "Ari",
      status: "ready",
    });

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: "p1",
        displayName: "Ari",
        status: "ready",
      })
    );
  });

  it("subscribeToPresence does not throw when called AFTER trackPresence has already subscribed the channel", async () => {
    // Regression test: @supabase/realtime-js throws if `channel.on("presence",
    // ...)` is called once the channel is already joined/joining (verified
    // against the installed SDK — see createFakeChannel's `joined` guard
    // above). trackPresence and subscribeToPresence can legitimately run in
    // either order across different components/effects (e.g. CaptureClient's
    // separate "announce presence" and "watch presence for all-ready" effects),
    // so subscribeToPresence must never itself call channel.on("presence", ...)
    // — see getSessionChannel's doc comment for the fix.
    const { realtime } = await setup();
    const sessionId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

    await realtime.trackPresence(sessionId, {
      participantId: "p1",
      displayName: "Ari",
      status: "ready",
    });

    const onSync = vi.fn();
    expect(() => realtime.subscribeToPresence(sessionId, onSync)).not.toThrow();

    await Promise.resolve(); // flush the deferred seed-call microtask (see the immediate-seed test below)
    expect(onSync).toHaveBeenCalled();
  });

  it("subscribeToPresence registers sync/join/leave listeners and flattens presenceState() into PresenceState[]", async () => {
    const { realtime } = await setup();
    const sessionId = "66666666-6666-6666-6666-666666666666";
    const channel = asFake(realtime.getSessionChannel(sessionId));

    channel.presenceState.mockReturnValue({
      "key-1": [
        { presence_ref: "ref-1", participantId: "p1", displayName: "Ari", status: "ready" },
      ],
      "key-2": [
        { presence_ref: "ref-2", participantId: "p2", displayName: "Bo", status: "connected" },
      ],
    });

    const onSync = vi.fn();
    const unsubscribe = realtime.subscribeToPresence(sessionId, onSync);

    const syncBinding = channel.bindings.find(
      (b) => b.type === "presence" && b.filter.event === "sync"
    );
    expect(syncBinding).toBeDefined();
    syncBinding!.callback(undefined);

    expect(onSync).toHaveBeenCalledWith([
      { participantId: "p1", displayName: "Ari", status: "ready" },
      { participantId: "p2", displayName: "Bo", status: "connected" },
    ]);
    expect(typeof unsubscribe).toBe("function");
  });

  it("subscribeToPresence immediately seeds a newly-registered listener with the current presence state, not just future events", async () => {
    const { realtime } = await setup();
    const sessionId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const channel = asFake(realtime.getSessionChannel(sessionId));
    channel.presenceState.mockReturnValue({
      "key-1": [
        { presence_ref: "ref-1", participantId: "p1", displayName: "Ari", status: "ready" },
      ],
    });

    const onSync = vi.fn();
    realtime.subscribeToPresence(sessionId, onSync);

    // Seeded on subscribe (deferred to a microtask — see subscribeToPresence's
    // doc comment for why it isn't called synchronously), without waiting for
    // a raw "sync"/"join"/"leave" event — protects against a listener
    // subscribing after presence has already stabilized (e.g. a
    // late-mounting effect), which would otherwise never receive an update
    // and hang forever waiting for a state that already exists.
    expect(onSync).not.toHaveBeenCalled(); // not yet — still deferred
    await Promise.resolve();
    expect(onSync).toHaveBeenCalledWith([
      { participantId: "p1", displayName: "Ari", status: "ready" },
    ]);
  });

  it("subscribeToPresence's returned unsubscribe stops further delivery to onSync, including the still-pending seed call", async () => {
    const { realtime } = await setup();
    const sessionId = "77777777-7777-7777-7777-777777777777";
    const channel = asFake(realtime.getSessionChannel(sessionId));
    channel.presenceState.mockReturnValue({});

    const onSync = vi.fn();
    const unsubscribe = realtime.subscribeToPresence(sessionId, onSync);
    unsubscribe(); // called before the deferred seed microtask has run

    const syncBinding = channel.bindings.find(
      (b) => b.type === "presence" && b.filter.event === "sync"
    );
    syncBinding!.callback(undefined);

    await Promise.resolve(); // flush the (now-cancelled) seed microtask too
    expect(onSync).not.toHaveBeenCalled();
  });

  it("broadcastCountdownStart sends a countdown_start broadcast with the server timestamp", async () => {
    const { realtime } = await setup();
    const sessionId = "88888888-8888-8888-8888-888888888888";
    const channel = realtime.getSessionChannel(sessionId);

    await realtime.broadcastCountdownStart(sessionId, { serverTimestamp: 12345 });

    expect(channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "countdown_start",
      payload: { serverTimestamp: 12345 },
    });
  });

  it("subscribeToCountdown delivers countdown_start broadcasts to the caller", async () => {
    const { realtime } = await setup();
    const sessionId = "99999999-9999-9999-9999-999999999999";
    const channel = asFake(realtime.getSessionChannel(sessionId));

    const onCountdownStart = vi.fn();
    realtime.subscribeToCountdown(sessionId, onCountdownStart);

    const binding = channel.bindings.find(
      (b) => b.type === "broadcast" && b.filter.event === "countdown_start"
    );
    expect(binding).toBeDefined();
    binding!.callback({ payload: { serverTimestamp: 999 } });

    expect(onCountdownStart).toHaveBeenCalledWith({ serverTimestamp: 999 });
  });

  it("broadcastCaptureAck / subscribeToCaptureAck round-trip the participantId", async () => {
    const { realtime } = await setup();
    const sessionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const channel = asFake(realtime.getSessionChannel(sessionId));

    const onCaptureAck = vi.fn();
    realtime.subscribeToCaptureAck(sessionId, onCaptureAck);

    await realtime.broadcastCaptureAck(sessionId, { participantId: "p1" });

    expect(channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "capture_ack",
      payload: { participantId: "p1" },
    });

    const binding = channel.bindings.find(
      (b) => b.type === "broadcast" && b.filter.event === "capture_ack"
    );
    binding!.callback({ payload: { participantId: "p1" } });
    expect(onCaptureAck).toHaveBeenCalledWith({ participantId: "p1" });
  });

  it("broadcastShot / subscribeToShots round-trip a relayed shot payload", async () => {
    const { realtime } = await setup();
    const sessionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const channel = asFake(realtime.getSessionChannel(sessionId));

    const onShot = vi.fn();
    realtime.subscribeToShots(sessionId, onShot);

    const shotPayload = { participantId: "p1", shotIndex: 0, dataUrl: "data:image/png;base64,AA==" };
    await realtime.broadcastShot(sessionId, shotPayload);

    expect(channel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "shot",
      payload: shotPayload,
    });

    const binding = channel.bindings.find((b) => b.type === "broadcast" && b.filter.event === "shot");
    binding!.callback({ payload: shotPayload });
    expect(onShot).toHaveBeenCalledWith(shotPayload);
  });

  it("leaveSessionChannel removes the channel and clears the cache so a later call creates a fresh one", async () => {
    const { realtime, supabase } = await setup();
    const sessionId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const channel = realtime.getSessionChannel(sessionId);

    realtime.leaveSessionChannel(sessionId);

    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);

    const recreated = realtime.getSessionChannel(sessionId);
    expect(recreated).not.toBe(channel);
    expect(supabase.channel).toHaveBeenCalledTimes(2);
  });
});
