import { describe, expect, it } from "vitest";
import { joinSessionSchema, participantStatusSchema } from "./participant";

describe("joinSessionSchema", () => {
  it("accepts a valid display name", () => {
    const result = joinSessionSchema.safeParse({ displayName: "Alex" });
    expect(result.success).toBe(true);
  });

  it("accepts a display name at the 40 char boundary", () => {
    const result = joinSessionSchema.safeParse({
      displayName: "a".repeat(40),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an oversized display name (41+ chars)", () => {
    const result = joinSessionSchema.safeParse({
      displayName: "a".repeat(41),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty display name", () => {
    const result = joinSessionSchema.safeParse({ displayName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a display name that is empty after trimming whitespace", () => {
    const result = joinSessionSchema.safeParse({ displayName: "    " });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from a valid name", () => {
    const result = joinSessionSchema.safeParse({ displayName: "  Alex  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alex");
    }
  });

  it("rejects a missing display name", () => {
    const result = joinSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("participantStatusSchema", () => {
  it.each(["connected", "ready", "captured", "dropped"])(
    "accepts valid status '%s'",
    (status) => {
      const result = participantStatusSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  );

  it("rejects an unrecognized status", () => {
    const result = participantStatusSchema.safeParse({ status: "bogus" });
    expect(result.success).toBe(false);
  });
});
