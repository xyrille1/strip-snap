import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/health (integration, live local Supabase)", () => {
  it("returns { status: 'ok', timestamp } when the DB is reachable", async () => {
    const before = Date.now();
    const response = await GET();
    const after = Date.now();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.status).toBe("ok");
    const timestampMs = new Date(body.timestamp).getTime();
    expect(timestampMs).toBeGreaterThanOrEqual(before);
    expect(timestampMs).toBeLessThanOrEqual(after);
  });

  it("returns nothing but status and timestamp — no row data leaked", async () => {
    const response = await GET();
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(["status", "timestamp"]);
  });
});
