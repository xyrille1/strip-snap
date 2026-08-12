import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CountdownStartPayload } from "./realtime";
import {
  DEFAULT_LEAD_MS,
  JITTER_MAX_MS,
  LEAD_MS_OPTIONS,
  startCountdownSync,
} from "./countdownSync";

/**
 * Deterministic fake clock, decoupled from vi's fake timers. vi's fake
 * timers control *when* setTimeout callbacks fire; this separate counter
 * controls what `now()` reports to the code under test at the moment it's
 * called. `tick(ms)` advances both together so the two stay consistent.
 */
function createClock(startAt = 0) {
  let current = startAt;
  return {
    now: () => current,
    async tick(ms: number) {
      current += ms;
      await vi.advanceTimersByTimeAsync(ms);
    },
  };
}

function fakeSubscribeToCountdown() {
  const listeners: Array<(payload: CountdownStartPayload) => void> = [];
  const unsubscribe = vi.fn();
  const subscribeToCountdown = vi.fn(
    (onCountdownStart: (payload: CountdownStartPayload) => void) => {
      listeners.push(onCountdownStart);
      return unsubscribe;
    }
  );
  return {
    subscribeToCountdown,
    unsubscribe,
    deliver: (payload: CountdownStartPayload) => {
      listeners.forEach((fn) => fn(payload));
    },
  };
}

describe("lib/countdownSync#startCountdownSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports LEAD_MS_OPTIONS as [5000, 10000], DEFAULT_LEAD_MS as 5000, and JITTER_MAX_MS in the documented 0-400ms range", () => {
    expect(LEAD_MS_OPTIONS).toEqual([5000, 10000]);
    expect(DEFAULT_LEAD_MS).toBe(5000);
    expect(JITTER_MAX_MS).toBeGreaterThan(0);
    expect(JITTER_MAX_MS).toBeLessThanOrEqual(400);
  });

  it("volunteers after the jitter delay when no countdown_start is received first: fetches server time, broadcasts leadMs ahead, and schedules its own capture off that", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockResolvedValue(5000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();

    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 0 }
    );

    // jitter delay = floor(0 * 400) = 0ms
    await clock.tick(0);

    expect(fetchServerNow).toHaveBeenCalledTimes(1);
    expect(broadcastCountdownStart).toHaveBeenCalledWith({ serverTimestamp: 10000, leadMs: 5000 });
    // offsetMs = serverNow(5000) - localNowAtReading(0) = 5000
    // localTargetEpoch = serverTimestamp(10000) + offsetMs(5000) = 15000
    expect(onScheduled).toHaveBeenCalledWith(15000, 10000, 5000);
    expect(onCaptureTime).not.toHaveBeenCalled();

    await clock.tick(15000);
    expect(onCaptureTime).toHaveBeenCalledTimes(1);
  });

  it("never fires onCaptureTime synchronously from the broadcast/volunteer path — only from the computed setTimeout", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockResolvedValue(1000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();

    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 0 }
    );

    await clock.tick(0); // jitter fires, volunteers, schedules
    expect(onScheduled).toHaveBeenCalledTimes(1);
    expect(onCaptureTime).not.toHaveBeenCalled();

    await clock.tick(1000);
    expect(onCaptureTime).not.toHaveBeenCalled();
  });

  it("first-received-wins: uses the first received countdown_start and ignores a later one, even if the jitter never fires", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown, deliver } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockResolvedValue(6000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();

    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 1 }
      // jitter delay = floor(1 * 400) = 400ms — never advance timers that far
    );

    deliver({ serverTimestamp: 10000, leadMs: 4000 });
    await clock.tick(0); // flush the async handleReceived microtasks

    expect(broadcastCountdownStart).not.toHaveBeenCalled(); // this client never volunteered
    expect(onScheduled).toHaveBeenCalledTimes(1);
    // offsetMs = serverNow(6000) - now()(0) = 6000; localTargetEpoch = 10000 + 6000 = 16000
    expect(onScheduled).toHaveBeenCalledWith(16000, 10000, 4000);

    // A second, later broadcast arrives — must be ignored (first received wins).
    deliver({ serverTimestamp: 99999, leadMs: 4000 });
    await clock.tick(0);
    expect(onScheduled).toHaveBeenCalledTimes(1);

    // Advancing past the (never-fired) jitter delay must not trigger a volunteer broadcast either.
    await clock.tick(400);
    expect(broadcastCountdownStart).not.toHaveBeenCalled();

    // Capture still fires off the FIRST payload's schedule (16000), not the second's.
    await clock.tick(16000 - 400);
    expect(onCaptureTime).toHaveBeenCalledTimes(1);
  });

  it("no host, winner decides: a client with its own leadMs selection adopts the broadcaster's leadMs instead when it receives a countdown_start before its own jitter fires, and never broadcasts itself", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown, deliver } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockResolvedValue(6000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();

    // This client's own local selection is 10000ms — but another client
    // wins the election and broadcasts leadMs: 5000. This client must adopt
    // 5000 (the winner's value), not its own 10000 selection, and must
    // never itself broadcast (it never volunteered — a broadcast arrived
    // before its jitter fired).
    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 10000, jitterMaxMs: 400, now: clock.now, random: () => 1 }
      // jitter delay = floor(1 * 400) = 400ms — never advance timers that far
    );

    deliver({ serverTimestamp: 10000, leadMs: 5000 });
    await clock.tick(0); // flush the async handleReceived microtasks

    expect(broadcastCountdownStart).not.toHaveBeenCalled(); // this client never volunteered
    // offsetMs = serverNow(6000) - now()(0) = 6000; localTargetEpoch = 10000 + 6000 = 16000
    expect(onScheduled).toHaveBeenCalledWith(16000, 10000, 5000); // leadMs === 5000, the broadcaster's value — not this client's own 10000

    // Advancing past the (never-fired) jitter delay must still never trigger a volunteer broadcast.
    await clock.tick(400);
    expect(broadcastCountdownStart).not.toHaveBeenCalled();
  });

  it("ignores a second countdown_start received after this client already volunteered and scheduled off its own broadcast", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown, deliver } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockResolvedValue(2000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();

    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 0 }
    );

    await clock.tick(0); // volunteers: serverTimestamp = 2000 + 5000 = 7000
    // offsetMs = serverNow(2000) - localNowAtReading(0) = 2000; localTargetEpoch = 7000 + 2000 = 9000
    expect(onScheduled).toHaveBeenCalledWith(9000, 7000, 5000);

    // A late straggler broadcast (e.g. another client's own jitter fired moments later).
    deliver({ serverTimestamp: 77777, leadMs: 3000 });
    await clock.tick(0);
    expect(onScheduled).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending jitter timer once a countdown_start is received before it fires", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown, deliver } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockResolvedValue(1000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();

    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 0.5 }
      // jitter delay = floor(0.5 * 400) = 200ms
    );

    await clock.tick(100); // before the jitter fires
    deliver({ serverTimestamp: 8000, leadMs: 4000 });
    await clock.tick(0); // flush handleReceived

    expect(onScheduled).toHaveBeenCalledTimes(1);

    // Advance well past the original 200ms jitter delay — must not volunteer.
    await clock.tick(1000);
    expect(broadcastCountdownStart).not.toHaveBeenCalled();
  });

  it("falls back to a zero clock offset (treats received serverTimestamp as already local) if GET /api/time fails on receipt", async () => {
    const clock = createClock(500);
    const { subscribeToCountdown, deliver } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockRejectedValue(new Error("network down"));
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 1 }
    );

    deliver({ serverTimestamp: 9500, leadMs: 4000 });
    await clock.tick(0);

    expect(onScheduled).toHaveBeenCalledWith(9500, 9500, 4000); // offset 0 -> localTargetEpoch === serverTimestamp
    expect(consoleErrorSpy).toHaveBeenCalled();

    await clock.tick(9500 - 500);
    expect(onCaptureTime).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("does not broadcast when GET /api/time fails while volunteering, leaving election to another client", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown, deliver } = fakeSubscribeToCountdown();
    const fetchServerNow = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(3000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 0 }
    );

    await clock.tick(0); // jitter fires, volunteer's fetchServerNow rejects
    expect(broadcastCountdownStart).not.toHaveBeenCalled();
    expect(onScheduled).not.toHaveBeenCalled();

    // Another client's broadcast arrives afterward — still usable.
    deliver({ serverTimestamp: 6000, leadMs: 4000 });
    await clock.tick(0);
    expect(onScheduled).toHaveBeenCalledWith(9000, 6000, 4000); // offsetMs = 3000 - 0

    consoleErrorSpy.mockRestore();
  });

  it("stop() unsubscribes and cancels pending jitter/capture timers", async () => {
    const clock = createClock(0);
    const { subscribeToCountdown, unsubscribe } = fakeSubscribeToCountdown();
    const fetchServerNow = vi.fn().mockResolvedValue(1000);
    const broadcastCountdownStart = vi.fn().mockResolvedValue(undefined);
    const onScheduled = vi.fn();
    const onCaptureTime = vi.fn();

    const handle = startCountdownSync(
      { fetchServerNow, broadcastCountdownStart, subscribeToCountdown },
      { onScheduled, onCaptureTime },
      { leadMs: 5000, jitterMaxMs: 400, now: clock.now, random: () => 0.9 }
      // jitter delay = 360ms
    );

    handle.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await clock.tick(10000);
    expect(broadcastCountdownStart).not.toHaveBeenCalled();
    expect(onScheduled).not.toHaveBeenCalled();
    expect(onCaptureTime).not.toHaveBeenCalled();
  });
});
