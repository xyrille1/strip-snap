import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("lib/styleStorage#saveSelectedStyle / loadSelectedStyle", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a valid preset", async () => {
    installFakeSessionStorage();
    const { saveSelectedStyle, loadSelectedStyle } = await import("./styleStorage");
    const sessionId = "session-a";

    saveSelectedStyle(sessionId, "sepia");

    expect(loadSelectedStyle(sessionId)).toBe("sepia");
  });

  it("keys storage per sessionId", async () => {
    installFakeSessionStorage();
    const { saveSelectedStyle, loadSelectedStyle } = await import("./styleStorage");

    saveSelectedStyle("session-a", "classic_bw");

    expect(loadSelectedStyle("session-b")).toBeNull();
  });

  it("returns null when nothing stored", async () => {
    installFakeSessionStorage();
    const { loadSelectedStyle } = await import("./styleStorage");

    expect(loadSelectedStyle("never-selected")).toBeNull();
  });

  it("returns null for a stored value that isn't a recognized preset", async () => {
    const { store } = installFakeSessionStorage();
    const { loadSelectedStyle } = await import("./styleStorage");
    store.set("photobooth:session-c:style", "not_a_real_preset");

    expect(loadSelectedStyle("session-c")).toBeNull();
  });

  it("is a no-op / returns null when window is unavailable (SSR safety)", async () => {
    const { saveSelectedStyle, loadSelectedStyle } = await import("./styleStorage");

    expect(() => saveSelectedStyle("session-d", "vintage_warm")).not.toThrow();
    expect(loadSelectedStyle("session-d")).toBeNull();
  });
});
