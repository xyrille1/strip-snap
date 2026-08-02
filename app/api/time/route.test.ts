import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/time", () => {
  it("returns { now } as the current epoch-ms server time", async () => {
    const before = Date.now();
    const response = await GET();
    const after = Date.now();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(typeof body.now).toBe("number");
    expect(body.now).toBeGreaterThanOrEqual(before);
    expect(body.now).toBeLessThanOrEqual(after);
  });

  it("returns nothing but the timestamp — no other fields leaked", async () => {
    const response = await GET();
    const body = await response.json();

    expect(Object.keys(body)).toEqual(["now"]);
  });

  it("sets Cache-Control: no-store so it's never served stale/cached", async () => {
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
