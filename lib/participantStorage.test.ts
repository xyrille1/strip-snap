import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/participantStorage.ts runs in the browser only (sessionStorage). The
 * project's vitest environment is "node" (vitest.config.ts), so there is no
 * ambient `window`/`sessionStorage` global by default — each test stubs a
 * minimal in-memory sessionStorage via `vi.stubGlobal` to exercise the real
 * read/write path, and the "no window" tests rely on the default (unstubbed)
 * node environment to prove the SSR-safety guard.
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

describe("lib/participantStorage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saveStoredParticipant then loadStoredParticipant round-trips the participant shape", async () => {
    installFakeSessionStorage();
    const { saveStoredParticipant, loadStoredParticipant } = await import(
      "./participantStorage"
    );
    const sessionId = "11111111-1111-1111-1111-111111111111";

    saveStoredParticipant(sessionId, {
      participantId: "p1",
      realtimeToken: "token-abc",
      displayName: "Ari",
    });

    expect(loadStoredParticipant(sessionId)).toEqual({
      participantId: "p1",
      realtimeToken: "token-abc",
      displayName: "Ari",
    });
  });

  it("keys storage per sessionId — one session's stored participant doesn't leak into another's read", async () => {
    installFakeSessionStorage();
    const { saveStoredParticipant, loadStoredParticipant } = await import(
      "./participantStorage"
    );

    saveStoredParticipant("session-a", {
      participantId: "p1",
      realtimeToken: "token-a",
      displayName: "Ari",
    });

    expect(loadStoredParticipant("session-b")).toBeNull();
  });

  it("loadStoredParticipant returns null when nothing has been stored for that session", async () => {
    installFakeSessionStorage();
    const { loadStoredParticipant } = await import("./participantStorage");

    expect(loadStoredParticipant("never-joined-session")).toBeNull();
  });

  it("loadStoredParticipant returns null (not a throw) for malformed JSON", async () => {
    const { store } = installFakeSessionStorage();
    const { loadStoredParticipant } = await import("./participantStorage");
    store.set("photobooth:session-c:participant", "{not-valid-json");

    expect(loadStoredParticipant("session-c")).toBeNull();
  });

  it("loadStoredParticipant returns null for a stored value missing required fields", async () => {
    const { store } = installFakeSessionStorage();
    const { loadStoredParticipant } = await import("./participantStorage");
    store.set(
      "photobooth:session-d:participant",
      JSON.stringify({ participantId: "p1" })
    );

    expect(loadStoredParticipant("session-d")).toBeNull();
  });

  it("is a no-op / returns null when window is unavailable (SSR safety)", async () => {
    // No installFakeSessionStorage() call — default node test environment has
    // no `window` global at all.
    const { saveStoredParticipant, loadStoredParticipant } = await import(
      "./participantStorage"
    );

    expect(() =>
      saveStoredParticipant("session-e", {
        participantId: "p1",
        realtimeToken: "t",
        displayName: "Ari",
      })
    ).not.toThrow();
    expect(loadStoredParticipant("session-e")).toBeNull();
  });
});
