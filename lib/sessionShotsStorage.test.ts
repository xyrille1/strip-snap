import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors lib/shotStorage.test.ts's fake-sessionStorage approach — see that
 * file's doc comment for why (node test environment has no ambient
 * `window`/`sessionStorage`).
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

describe("lib/sessionShotsStorage#saveSessionShots / loadSessionShots", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saveSessionShots then loadSessionShots round-trips the full map", async () => {
    installFakeSessionStorage();
    const { saveSessionShots, loadSessionShots } = await import("./sessionShotsStorage");
    const sessionId = "11111111-1111-1111-1111-111111111111";

    saveSessionShots(sessionId, {
      "participant-a": ["data:a0", "data:a1", null, "data:a3"],
      "participant-b": [null, null, null, null],
    });

    expect(loadSessionShots(sessionId)).toEqual({
      "participant-a": ["data:a0", "data:a1", null, "data:a3"],
      "participant-b": [null, null, null, null],
    });
  });

  it("keys storage per sessionId — one session's map doesn't leak into another's read", async () => {
    installFakeSessionStorage();
    const { saveSessionShots, loadSessionShots } = await import("./sessionShotsStorage");

    saveSessionShots("session-a", { "participant-a": ["data:a", null, null, null] });

    expect(loadSessionShots("session-b")).toBeNull();
  });

  it("loadSessionShots returns null when nothing has been stored for that session", async () => {
    installFakeSessionStorage();
    const { loadSessionShots } = await import("./sessionShotsStorage");

    expect(loadSessionShots("never-captured-session")).toBeNull();
  });

  it("loadSessionShots returns null (not a throw) for malformed JSON", async () => {
    const { store } = installFakeSessionStorage();
    const { loadSessionShots } = await import("./sessionShotsStorage");
    store.set("photobooth:session-c:allShots", "{not-valid-json");

    expect(loadSessionShots("session-c")).toBeNull();
  });

  it("loadSessionShots returns null when a participant's entry contains a non-string, non-null value", async () => {
    const { store } = installFakeSessionStorage();
    const { loadSessionShots } = await import("./sessionShotsStorage");
    store.set(
      "photobooth:session-d:allShots",
      JSON.stringify({ "participant-a": ["data:a", 42, null, null] })
    );

    expect(loadSessionShots("session-d")).toBeNull();
  });

  it("is a no-op / returns null when window is unavailable (SSR safety)", async () => {
    const { saveSessionShots, loadSessionShots } = await import("./sessionShotsStorage");

    expect(() =>
      saveSessionShots("session-e", { "participant-a": [null, null, null, null] })
    ).not.toThrow();
    expect(loadSessionShots("session-e")).toBeNull();
  });
});

describe("lib/sessionShotsStorage#updateParticipantShots", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts from an empty map and adds the given participant's entry when nothing was stored yet", async () => {
    installFakeSessionStorage();
    const { updateParticipantShots, loadSessionShots } = await import("./sessionShotsStorage");
    const sessionId = "session-f";

    const result = updateParticipantShots(sessionId, "participant-a", [
      "data:a0",
      null,
      null,
      null,
    ]);

    expect(result).toEqual({ "participant-a": ["data:a0", null, null, null] });
    expect(loadSessionShots(sessionId)).toEqual({ "participant-a": ["data:a0", null, null, null] });
  });

  it("updates only the given participant's entry — other participants' entries are untouched", async () => {
    installFakeSessionStorage();
    const { saveSessionShots, updateParticipantShots } = await import("./sessionShotsStorage");
    const sessionId = "session-g";

    saveSessionShots(sessionId, {
      "participant-a": ["data:a0", "data:a1", "data:a2", "data:a3"],
      "participant-b": ["data:b0", "data:b1", "data:b2", "data:b3"],
    });

    const result = updateParticipantShots(sessionId, "participant-a", [
      "retaken0",
      "data:a1",
      "data:a2",
      "data:a3",
    ]);

    expect(result).toEqual({
      "participant-a": ["retaken0", "data:a1", "data:a2", "data:a3"],
      "participant-b": ["data:b0", "data:b1", "data:b2", "data:b3"],
    });
  });
});
