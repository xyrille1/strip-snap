import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("checkRateLimit — fail open when Upstash is not configured", () => {
  const originalUrl = process.env.UPSTASH_REDIS_URL;
  const originalToken = process.env.UPSTASH_REDIS_TOKEN;

  beforeEach(() => {
    // Fresh module instance per test so the lazy-singleton redis client and
    // the "warned once" flag don't leak state between tests.
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_URL;
    delete process.env.UPSTASH_REDIS_TOKEN;
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_URL;
    } else {
      process.env.UPSTASH_REDIS_URL = originalUrl;
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_TOKEN = originalToken;
    }
    vi.restoreAllMocks();
  });

  it("resolves { success: true } without throwing when env vars are unset", async () => {
    const { checkRateLimit } = await import("./rateLimit");

    await expect(
      checkRateLimit("test-identifier", { limit: 5, windowSeconds: 60 })
    ).resolves.toEqual({ success: true });
  });

  it("logs a single console.warn the first time, and does not repeat on later calls", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { checkRateLimit } = await import("./rateLimit");

    await checkRateLimit("id-1", { limit: 5, windowSeconds: 60 });
    await checkRateLimit("id-2", { limit: 5, windowSeconds: 60 });
    await checkRateLimit("id-3", { limit: 10, windowSeconds: 30 });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("this repo's current environment actually has both vars unset (sanity check)", () => {
    // Confirms this test file is exercising the real current-state path, not
    // a hypothetical one — no Upstash project is provisioned yet.
    expect(originalUrl ?? "").toBe("");
    expect(originalToken ?? "").toBe("");
  });
});
