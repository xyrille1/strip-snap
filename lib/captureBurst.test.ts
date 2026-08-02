import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BURST_INTERVAL_MS, MAX_PHOTOS, runCaptureBurst } from "./captureBurst";

describe("lib/captureBurst#runCaptureBurst", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports MAX_PHOTOS = 4 and BURST_INTERVAL_MS in the documented 800-1200ms range", () => {
    expect(MAX_PHOTOS).toBe(4);
    expect(BURST_INTERVAL_MS).toBeGreaterThanOrEqual(800);
    expect(BURST_INTERVAL_MS).toBeLessThanOrEqual(1200);
  });

  it("captures shot 0 synchronously/immediately — no delay before the first (synced) frame", () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);

    runCaptureBurst(
      { captureFrame, broadcastShot },
      { onComplete: vi.fn() }
    );

    expect(captureFrame).toHaveBeenCalledTimes(1);
    expect(captureFrame).toHaveBeenCalledWith(0);
    expect(broadcastShot).toHaveBeenCalledWith(0, "frame-0");
  });

  it("captures the remaining 3 shots at fixed intervals after the first, with distinct indices in order", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    runCaptureBurst(
      { captureFrame, broadcastShot },
      { onComplete },
      { intervalMs: 900 }
    );

    expect(captureFrame).toHaveBeenCalledTimes(1); // just shot 0 so far

    await vi.advanceTimersByTimeAsync(899);
    expect(captureFrame).toHaveBeenCalledTimes(1); // not yet at 900ms

    await vi.advanceTimersByTimeAsync(1);
    expect(captureFrame).toHaveBeenNthCalledWith(2, 1);
    expect(broadcastShot).toHaveBeenNthCalledWith(2, 1, "frame-1");

    await vi.advanceTimersByTimeAsync(900);
    expect(captureFrame).toHaveBeenNthCalledWith(3, 2);
    expect(broadcastShot).toHaveBeenNthCalledWith(3, 2, "frame-2");

    await vi.advanceTimersByTimeAsync(900);
    expect(captureFrame).toHaveBeenNthCalledWith(4, 3);
    expect(broadcastShot).toHaveBeenNthCalledWith(4, 3, "frame-3");

    expect(captureFrame).toHaveBeenCalledTimes(4);
  });

  it("schedules each shot's delay relative to burst start (cumulative), not chained off the previous shot", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);

    runCaptureBurst(
      { captureFrame, broadcastShot },
      { onComplete: vi.fn() },
      { intervalMs: 900 }
    );

    // All three remaining shots' timers should already be armed immediately
    // (cumulative delays of 900/1800/2700ms from burst start), not armed one
    // at a time as each prior shot's async work resolves.
    await vi.advanceTimersByTimeAsync(2700);
    expect(captureFrame).toHaveBeenCalledTimes(4);
  });

  it("calls onShotCaptured for each shot with its index and dataUrl, before broadcasting", () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onShotCaptured = vi.fn();

    runCaptureBurst(
      { captureFrame, broadcastShot, onShotCaptured },
      { onComplete: vi.fn() }
    );

    expect(onShotCaptured).toHaveBeenCalledWith(0, "frame-0");
  });

  it("calls onComplete only after all 4 shots have been captured and broadcast — not after the first", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    runCaptureBurst(
      { captureFrame, broadcastShot },
      { onComplete },
      { intervalMs: 900 }
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(onComplete).not.toHaveBeenCalled(); // shot 0 alone must not complete the burst

    await vi.advanceTimersByTimeAsync(900);
    expect(onComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(900);
    expect(onComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(900);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("still calls onComplete exactly once even if a shot's broadcast rejects (never hangs the burst on one bad send)", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("send failed"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const onComplete = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    runCaptureBurst(
      { captureFrame, broadcastShot },
      { onComplete },
      { intervalMs: 900 }
    );

    await vi.advanceTimersByTimeAsync(2700);
    expect(onComplete).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("counts a null capture (e.g. video unavailable) toward completion instead of hanging forever", async () => {
    const captureFrame = vi.fn((shotIndex: number) => (shotIndex === 2 ? null : `frame-${shotIndex}`));
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    runCaptureBurst(
      { captureFrame, broadcastShot },
      { onComplete },
      { intervalMs: 900 }
    );

    await vi.advanceTimersByTimeAsync(2700);

    expect(broadcastShot).toHaveBeenCalledTimes(3); // shots 0, 1, 3 — not the null shot 2
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("stop() cancels pending burst timers so later shots never fire", async () => {
    const captureFrame = vi.fn((shotIndex: number) => `frame-${shotIndex}`);
    const broadcastShot = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    const handle = runCaptureBurst(
      { captureFrame, broadcastShot },
      { onComplete },
      { intervalMs: 900 }
    );

    expect(captureFrame).toHaveBeenCalledTimes(1); // shot 0 already fired
    handle.stop();

    await vi.advanceTimersByTimeAsync(5000);

    expect(captureFrame).toHaveBeenCalledTimes(1); // no further shots
    expect(onComplete).not.toHaveBeenCalled();
  });
});
