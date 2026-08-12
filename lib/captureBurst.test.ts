import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PHOTOS, ROUND_PAUSE_MS, runCaptureSequence } from "./captureBurst";

/**
 * Deterministic fake clock, decoupled from vi's fake timers. vi's fake
 * timers control *when* setTimeout callbacks fire; this separate counter
 * controls what `now()` reports to the code under test at the moment it's
 * called. `tick(ms)` advances both together so the two stay consistent.
 * Mirrors the pattern established in lib/countdownSync.test.ts.
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

describe("lib/captureBurst#runCaptureSequence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports MAX_PHOTOS = 4", () => {
    expect(MAX_PHOTOS).toBe(4);
  });

  it("captures shot 0 synchronously/immediately — no delay before the first (synced) frame", () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);

    runCaptureSequence(
      { captureFrame, broadcastShot },
      { onRoundAdvance: vi.fn(), onComplete: vi.fn() },
      { firstTargetEpoch: 0, leadMs: 5000 }
    );

    expect(captureFrame).toHaveBeenCalledTimes(1);
    expect(captureFrame).toHaveBeenCalledWith(0);
    expect(broadcastShot).toHaveBeenCalledWith(0, "frame-0");
  });

  it.each([5000, 10000])(
    "with leadMs=%dms and pauseMs=0, captures shot 1 only once now() reaches firstTargetEpoch + leadMs (not a moment before), and shots 2/3 at +2x/+3x",
    async (leadMs) => {
      const clock = createClock(0);
      const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
      const broadcastShot = vi.fn().mockResolvedValue(undefined);

      runCaptureSequence(
        { captureFrame, broadcastShot, now: clock.now },
        { onRoundAdvance: vi.fn(), onComplete: vi.fn() },
        { firstTargetEpoch: 0, leadMs, pauseMs: 0 }
      );

      expect(captureFrame).toHaveBeenCalledTimes(1); // just shot 0 so far

      // Flushes shot 0's broadcastShot settling (and the resulting round-1
      // timer arming) at ms=0, before `now()` moves at all — the clock
      // helper's `current` is bumped synchronously ahead of each tick's
      // async advancement, so this must happen in its own zero-length tick
      // rather than folded into the first real tick below.
      await clock.tick(0);

      await clock.tick(leadMs - 1);
      expect(captureFrame).toHaveBeenCalledTimes(1); // not yet at the round-1 target

      await clock.tick(1);
      expect(captureFrame).toHaveBeenNthCalledWith(2, 1);
      expect(broadcastShot).toHaveBeenNthCalledWith(2, 1, "frame-1");

      await clock.tick(leadMs);
      expect(captureFrame).toHaveBeenNthCalledWith(3, 2);
      expect(broadcastShot).toHaveBeenNthCalledWith(3, 2, "frame-2");

      await clock.tick(leadMs);
      expect(captureFrame).toHaveBeenNthCalledWith(4, 3);
      expect(broadcastShot).toHaveBeenNthCalledWith(4, 3, "frame-3");

      expect(captureFrame).toHaveBeenCalledTimes(4);
    }
  );

  it("epoch-anchoring: a late invocation (now() already past firstTargetEpoch by call time) does not shift round 1's target off the original firstTargetEpoch + leadMs", async () => {
    // Simulates the async gap between countdownSync's onScheduled firing and
    // this function actually being invoked — round 0's target has already
    // "elapsed" by some slop (200ms) by the time runCaptureSequence runs.
    const clock = createClock(5200); // firstTargetEpoch(5000) + 200ms slop
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);

    runCaptureSequence(
      { captureFrame, broadcastShot, now: clock.now },
      { onRoundAdvance: vi.fn(), onComplete: vi.fn() },
      { firstTargetEpoch: 5000, leadMs: 5000, pauseMs: 0 }
    );

    // Flushes shot 0's broadcastShot settling (and the resulting round-1
    // timer arming) while `now()` still reports the "late" 5200 start —
    // see the it.each test above for why this zero-length tick is needed.
    await clock.tick(0);

    // Round 1's target is firstTargetEpoch(5000) + 1*5000 = 10000, i.e.
    // 4800ms from "now" (5200), NOT re-based off the late call time (which
    // would incorrectly put it at 5200 + 5000 = 10200).
    await clock.tick(4799);
    expect(captureFrame).toHaveBeenCalledTimes(1); // not yet

    await clock.tick(1); // now() === 10000, the ORIGINAL target
    expect(captureFrame).toHaveBeenNthCalledWith(2, 1);
  });

  it("self-healing: a slow round-0 broadcast that resolves after round 1's target has already passed still fires round 1 immediately, clamped to 0 delay", async () => {
    const clock = createClock(0);
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    let resolveShot0: () => void;
    const shot0Promise = new Promise<void>((resolve) => {
      resolveShot0 = resolve;
    });
    const broadcastShot = vi.fn((shotIndex: number) => {
      if (shotIndex === 0) return shot0Promise;
      return Promise.resolve(undefined);
    });
    const onRoundAdvance = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot, now: clock.now },
      { onRoundAdvance, onComplete: vi.fn() },
      { firstTargetEpoch: 0, leadMs: 5000, pauseMs: 0 }
    );

    // Advance well past round 1's target (5000) while shot 0's broadcast is
    // still pending — round 1 must not have been scheduled/fired yet, since
    // it's chained off shot 0's broadcast settling, not pre-armed.
    await clock.tick(9000);
    expect(captureFrame).toHaveBeenCalledTimes(1);
    expect(onRoundAdvance).not.toHaveBeenCalled();

    // Now let shot 0's broadcast resolve — round 1 must fire essentially
    // immediately (delay clamped to 0), not hang or compute a negative
    // delay. With pauseMs: 0, the pause-end target and the capture target
    // are the same already-past instant, so this now clamps through TWO
    // chained 0-delay timers (pause-end -> reveal -> capture) instead of
    // one — `runAllTimersAsync` (rather than a fixed number of zero-length
    // ticks) drains however many of those chained immediate timers end up
    // pending, without hardcoding that count into the test.
    resolveShot0!();
    await vi.runAllTimersAsync();
    expect(onRoundAdvance).toHaveBeenCalledWith(1, 5000);
    expect(captureFrame).toHaveBeenNthCalledWith(2, 1);
  });

  it("calls onRoundAdvance with (1, targets[1]), (2, targets[2]), (3, targets[3]) in order and never after the last shot", async () => {
    const clock = createClock(1000); // matches firstTargetEpoch, so shot 0 is "on time"
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onRoundAdvance = vi.fn();
    const onComplete = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot, now: clock.now },
      { onRoundAdvance, onComplete },
      { firstTargetEpoch: 1000, leadMs: 5000, pauseMs: 0 }
    );

    await clock.tick(15000);

    expect(onRoundAdvance).toHaveBeenNthCalledWith(1, 1, 6000);
    expect(onRoundAdvance).toHaveBeenNthCalledWith(2, 2, 11000);
    expect(onRoundAdvance).toHaveBeenNthCalledWith(3, 3, 16000);
    expect(onRoundAdvance).toHaveBeenCalledTimes(3); // never called for/after the final shot (index 3)
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("calls onComplete exactly once, only after the last shot's broadcast has settled — not after shot 0 alone", async () => {
    const clock = createClock(0);
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot, now: clock.now },
      { onRoundAdvance: vi.fn(), onComplete },
      { firstTargetEpoch: 0, leadMs: 5000, pauseMs: 0 }
    );

    await clock.tick(0); // flush shot 0's settle + arm round 1's timer
    expect(onComplete).not.toHaveBeenCalled(); // shot 0 alone must not complete the sequence

    await clock.tick(5000);
    expect(onComplete).not.toHaveBeenCalled();

    await clock.tick(5000);
    expect(onComplete).not.toHaveBeenCalled();

    await clock.tick(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("calls onShotCaptured for each shot with its index and dataUrl, before broadcasting", () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onShotCaptured = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot, onShotCaptured },
      { onRoundAdvance: vi.fn(), onComplete: vi.fn() },
      { firstTargetEpoch: 0, leadMs: 5000 }
    );

    expect(onShotCaptured).toHaveBeenCalledWith(0, "frame-0");
  });

  it("still calls onComplete exactly once even if a shot's broadcast rejects (never hangs the sequence on one bad send)", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("send failed"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const onComplete = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    runCaptureSequence(
      { captureFrame, broadcastShot },
      { onRoundAdvance: vi.fn(), onComplete },
      { firstTargetEpoch: 0, leadMs: 5000, pauseMs: 0 }
    );

    await vi.advanceTimersByTimeAsync(15000);
    expect(onComplete).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("counts a null capture (e.g. video unavailable) toward completion instead of hanging forever", async () => {
    const captureFrame = vi.fn((shotIndex: number) => (shotIndex === 2 ? null : `frame-${shotIndex}`));
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot },
      { onRoundAdvance: vi.fn(), onComplete },
      { firstTargetEpoch: 0, leadMs: 5000, pauseMs: 0 }
    );

    await vi.advanceTimersByTimeAsync(15000);

    expect(broadcastShot).toHaveBeenCalledTimes(3); // shots 0, 1, 3 — not the null shot 2
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("onRoundCaptureTime fires for shots 1..N-1 (never for shot 0, whose drift is countdownSync's job) with a non-negative driftMs, in round order", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onRoundCaptureTime = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot },
      { onRoundAdvance: vi.fn(), onComplete: vi.fn(), onRoundCaptureTime },
      { firstTargetEpoch: 0, leadMs: 5000, pauseMs: 0 }
    );

    await vi.advanceTimersByTimeAsync(15000);

    expect(onRoundCaptureTime).toHaveBeenCalledTimes(3);
    expect(onRoundCaptureTime.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
    for (const call of onRoundCaptureTime.mock.calls) {
      expect(call[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it("stop() cancels the pending next-round timer so later shots never fire", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    const handle = runCaptureSequence(
      { captureFrame, broadcastShot },
      { onRoundAdvance: vi.fn(), onComplete },
      { firstTargetEpoch: 0, leadMs: 5000 }
    );

    expect(captureFrame).toHaveBeenCalledTimes(1); // shot 0 already fired
    // Stop synchronously, before shot 0's broadcastShot promise has even had
    // a chance to settle — afterShotSettled's own `stopped` guard (checked
    // whenever that pending microtask eventually runs) must prevent round 1
    // from ever being armed at all, regardless of timing.
    handle.stop();

    await vi.advanceTimersByTimeAsync(20000);

    expect(captureFrame).toHaveBeenCalledTimes(1); // no further shots
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("exports ROUND_PAUSE_MS = 2000", () => {
    expect(ROUND_PAUSE_MS).toBe(2000);
  });

  it("with the default pauseMs, holds off revealing round 1's countdown (onRoundAdvance) until ROUND_PAUSE_MS after shot 0 settles, then still requires a full leadMs before capturing shot 1", async () => {
    const clock = createClock(0);
    const leadMs = 5000;
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onRoundAdvance = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot, now: clock.now },
      { onRoundAdvance, onComplete: vi.fn() },
      { firstTargetEpoch: 0, leadMs } // pauseMs omitted — defaults to ROUND_PAUSE_MS
    );

    // Flushes shot 0's broadcastShot settling (and the resulting pause
    // timer arming) at ms=0 — see the it.each test above for why this
    // zero-length tick is needed.
    await clock.tick(0);
    expect(onRoundAdvance).not.toHaveBeenCalled(); // still paused, nothing revealed yet

    await clock.tick(ROUND_PAUSE_MS - 1);
    expect(onRoundAdvance).not.toHaveBeenCalled(); // pause not over yet
    expect(captureFrame).toHaveBeenCalledTimes(1); // still just shot 0

    await clock.tick(1); // pause elapses at ROUND_PAUSE_MS
    const round1Target = leadMs + ROUND_PAUSE_MS;
    expect(onRoundAdvance).toHaveBeenCalledWith(1, round1Target);
    expect(captureFrame).toHaveBeenCalledTimes(1); // reveal only — not a capture

    await clock.tick(leadMs - 1);
    expect(captureFrame).toHaveBeenCalledTimes(1); // countdown still running

    await clock.tick(1); // full leadMs after the reveal — now() === round1Target
    expect(captureFrame).toHaveBeenNthCalledWith(2, 1);
    expect(broadcastShot).toHaveBeenNthCalledWith(2, 1, "frame-1");
  });

  it("applies the ROUND_PAUSE_MS gap cumulatively before every round, not just round 1", async () => {
    const clock = createClock(0);
    const leadMs = 5000;
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onRoundAdvance = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot, now: clock.now },
      { onRoundAdvance, onComplete: vi.fn() },
      { firstTargetEpoch: 0, leadMs }
    );

    await clock.tick(0);
    await clock.tick(leadMs + ROUND_PAUSE_MS);
    expect(onRoundAdvance).toHaveBeenNthCalledWith(1, 1, leadMs + ROUND_PAUSE_MS);

    await clock.tick(leadMs + ROUND_PAUSE_MS);
    expect(onRoundAdvance).toHaveBeenNthCalledWith(2, 2, 2 * (leadMs + ROUND_PAUSE_MS));

    await clock.tick(leadMs + ROUND_PAUSE_MS);
    expect(onRoundAdvance).toHaveBeenNthCalledWith(3, 3, 3 * (leadMs + ROUND_PAUSE_MS));

    expect(onRoundAdvance).toHaveBeenCalledTimes(3);
  });

  it("a custom pauseMs override changes the gap (tests-only escape hatch — production always uses the ROUND_PAUSE_MS default)", async () => {
    const clock = createClock(0);
    const leadMs = 5000;
    const pauseMs = 500;
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onRoundAdvance = vi.fn();

    runCaptureSequence(
      { captureFrame, broadcastShot, now: clock.now },
      { onRoundAdvance, onComplete: vi.fn() },
      { firstTargetEpoch: 0, leadMs, pauseMs }
    );

    await clock.tick(0);
    await clock.tick(pauseMs - 1);
    expect(onRoundAdvance).not.toHaveBeenCalled();

    await clock.tick(1);
    expect(onRoundAdvance).toHaveBeenCalledWith(1, leadMs + pauseMs);
  });
});
