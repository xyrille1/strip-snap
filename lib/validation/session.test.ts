import { describe, expect, it } from "vitest";
import { createSessionSchema, sessionIdParamSchema } from "./session";

describe("createSessionSchema", () => {
  it("accepts a valid solo mode", () => {
    const result = createSessionSchema.safeParse({ mode: "solo" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid invite mode", () => {
    const result = createSessionSchema.safeParse({ mode: "invite" });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized mode", () => {
    const result = createSessionSchema.safeParse({ mode: "bogus" });
    expect(result.success).toBe(false);
  });

  it("does not accept a format field at creation time (schema has no such key)", () => {
    // format only ever changes via a separate authenticated upgrade endpoint;
    // even if a client sends it, the parsed/inferred type never carries it.
    const result = createSessionSchema.safeParse({
      mode: "solo",
      format: "4",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ mode: "solo" });
      expect((result.data as Record<string, unknown>).format).toBeUndefined();
    }
  });

  it("rejects a missing mode", () => {
    const result = createSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("sessionIdParamSchema", () => {
  it("accepts a valid uuid", () => {
    const result = sessionIdParamSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed session id (not a UUID)", () => {
    const result = sessionIdParamSchema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing id", () => {
    const result = sessionIdParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
