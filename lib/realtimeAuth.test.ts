import { describe, it, expect, afterEach } from "vitest";
import { jwtVerify } from "jose";
import { mintRealtimeToken } from "./realtimeAuth";

const REALTIME_TOKEN_TTL_SECONDS = 30 * 60;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

describe("lib/realtimeAuth#mintRealtimeToken", () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET;

  afterEach(() => {
    process.env.SUPABASE_JWT_SECRET = originalSecret;
  });

  it("mints a JWT carrying role, topic (session:{id}), session_id, and participant_id claims", async () => {
    const sessionId = crypto.randomUUID();
    const participantId = crypto.randomUUID();

    const token = await mintRealtimeToken(sessionId, participantId);

    const { payload } = await jwtVerify(token, secretKey(process.env.SUPABASE_JWT_SECRET!), {
      algorithms: ["HS256"],
    });

    expect(payload.role).toBe("authenticated");
    expect(payload.topic).toBe(`session:${sessionId}`);
    expect(payload.session_id).toBe(sessionId);
    expect(payload.participant_id).toBe(participantId);
  });

  it("sets a short (~30 minute) expiry derived from issued-at time", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await mintRealtimeToken(crypto.randomUUID(), crypto.randomUUID());

    const { payload } = await jwtVerify(token, secretKey(process.env.SUPABASE_JWT_SECRET!), {
      algorithms: ["HS256"],
    });

    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect((payload.exp as number) - (payload.iat as number)).toBe(
      REALTIME_TOKEN_TTL_SECONDS
    );
    expect(payload.exp).toBeGreaterThanOrEqual(before + REALTIME_TOKEN_TTL_SECONDS);
    expect(payload.exp).toBeLessThanOrEqual(before + REALTIME_TOKEN_TTL_SECONDS + 5);
  });

  it("fails verification against a different secret (proves it's actually signed, not forgeable)", async () => {
    const token = await mintRealtimeToken(crypto.randomUUID(), crypto.randomUUID());
    const wrongSecret = secretKey("a-totally-different-secret-value-that-is-long-enough");

    await expect(
      jwtVerify(token, wrongSecret, { algorithms: ["HS256"] })
    ).rejects.toThrow();
  });

  it("throws clearly when SUPABASE_JWT_SECRET is unset", async () => {
    delete process.env.SUPABASE_JWT_SECRET;

    await expect(
      mintRealtimeToken(crypto.randomUUID(), crypto.randomUUID())
    ).rejects.toThrow(/SUPABASE_JWT_SECRET/);
  });
});
