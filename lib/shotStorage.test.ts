import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/shotStorage.ts runs in the browser only (sessionStorage). The
 * project's vitest environment is "node" (vitest.config.ts), so there is no
 * ambient `window`/`sessionStorage` global by default — mirrors
 * lib/participantStorage.test.ts's approach: each test stubs a minimal
 * in-memory sessionStorage via `vi.stubGlobal` to exercise the real
 * read/write path, and the "no window" test relies on the default
 * (unstubbed) node environment to prove the SSR-safety guard.
 */

function installFakeSessionStorage() {
  const store = new Map<string, string>();
  const fakeSessionStorage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
  vi.stubGlobal("window", { sessionStorage: fakeSessionStorage });
  return { store, fakeSessionStorage };
}

describe("lib/shotStorage#saveStoredShots / loadStoredShots", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saveStoredShots then loadStoredShots round-trips the shots shape", async () => {
    installFakeSessionStorage();
    const { saveStoredShots, loadStoredShots } = await import("./shotStorage");
    const sessionId = "11111111-1111-1111-1111-111111111111";

    saveStoredShots(sessionId, {
      participantId: "p1",
      shots: ["data:a", "data:b", null, "data:d"],
    });

    expect(loadStoredShots(sessionId)).toEqual({
      participantId: "p1",
      shots: ["data:a", "data:b", null, "data:d"],
    });
  });

  it("keys storage per sessionId — one session's stored shots don't leak into another's read", async () => {
    installFakeSessionStorage();
    const { saveStoredShots, loadStoredShots } = await import("./shotStorage");

    saveStoredShots("session-a", {
      participantId: "p1",
      shots: ["data:a", null, null, null],
    });

    expect(loadStoredShots("session-b")).toBeNull();
  });

  it("loadStoredShots returns null when nothing has been stored for that session", async () => {
    installFakeSessionStorage();
    const { loadStoredShots } = await import("./shotStorage");

    expect(loadStoredShots("never-captured-session")).toBeNull();
  });

  it("loadStoredShots returns null (not a throw) for malformed JSON", async () => {
    const { store } = installFakeSessionStorage();
    const { loadStoredShots } = await import("./shotStorage");
    store.set("photobooth:session-c:shots", "{not-valid-json");

    expect(loadStoredShots("session-c")).toBeNull();
  });

  it("loadStoredShots returns null for a stored value missing required fields", async () => {
    const { store } = installFakeSessionStorage();
    const { loadStoredShots } = await import("./shotStorage");
    store.set("photobooth:session-d:shots", JSON.stringify({ participantId: "p1" }));

    expect(loadStoredShots("session-d")).toBeNull();
  });

  it("loadStoredShots returns null when the shots array contains a non-string, non-null entry", async () => {
    const { store } = installFakeSessionStorage();
    const { loadStoredShots } = await import("./shotStorage");
    store.set(
      "photobooth:session-e:shots",
      JSON.stringify({ participantId: "p1", shots: ["data:a", 42, null, null] })
    );

    expect(loadStoredShots("session-e")).toBeNull();
  });

  it("is a no-op / returns null when window is unavailable (SSR safety)", async () => {
    // No installFakeSessionStorage() call — default node test environment has
    // no `window` global at all.
    const { saveStoredShots, loadStoredShots } = await import("./shotStorage");

    expect(() =>
      saveStoredShots("session-f", { participantId: "p1", shots: [null, null, null, null] })
    ).not.toThrow();
    expect(loadStoredShots("session-f")).toBeNull();
  });
});

describe("lib/shotStorage#replaceShotAt", () => {
  it("replaces only the target index — all other indices are untouched (F-16)", async () => {
    const { replaceShotAt } = await import("./shotStorage");
    const original = ["orig0", "orig1", "orig2", "orig3"];

    const result = replaceShotAt(original, 2, "retaken2");

    expect(result).toEqual(["orig0", "orig1", "retaken2", "orig3"]);
  });

  it("does not mutate the input array", async () => {
    const { replaceShotAt } = await import("./shotStorage");
    const original = ["orig0", "orig1", "orig2", "orig3"];

    replaceShotAt(original, 1, "retaken1");

    expect(original).toEqual(["orig0", "orig1", "orig2", "orig3"]);
  });

  it("fills in a previously-null slot without disturbing captured neighbors", async () => {
    const { replaceShotAt } = await import("./shotStorage");
    const original = ["orig0", null, "orig2", "orig3"];

    const result = replaceShotAt(original, 1, "filled1");

    expect(result).toEqual(["orig0", "filled1", "orig2", "orig3"]);
  });

  it("repeated retakes — shot 2, then shot 0, then shot 2 again — end with exactly the latest capture in each slot, nothing duplicated or lost (F-17)", async () => {
    const { replaceShotAt } = await import("./shotStorage");
    const original = ["orig0", "orig1", "orig2", "orig3"];

    const afterFirstRetake = replaceShotAt(original, 2, "retake2-a");
    const afterSecondRetake = replaceShotAt(afterFirstRetake, 0, "retake0");
    const afterThirdRetake = replaceShotAt(afterSecondRetake, 2, "retake2-b");

    // Index 2 reflects the LATEST retake (retake2-b), not the first
    // (retake2-a) — proves no stale-closure/off-by-one bug re-applies an
    // earlier capture or loses the most recent one.
    expect(afterThirdRetake).toEqual(["retake0", "orig1", "retake2-b", "orig3"]);
    // Every intermediate array stays untouched by later calls (immutability
    // holds across the whole chain, not just one hop).
    expect(afterFirstRetake).toEqual(["orig0", "orig1", "retake2-a", "orig3"]);
    expect(afterSecondRetake).toEqual(["retake0", "orig1", "retake2-a", "orig3"]);
    expect(original).toEqual(["orig0", "orig1", "orig2", "orig3"]);
  });
});
