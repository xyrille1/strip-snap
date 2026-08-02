import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Proves the RLS policies added in 20260801172541_realtime_authorization.sql actually enforce
 * cross-session isolation on realtime.messages — not just "looks correct by inspection".
 *
 * This connects directly to the local Postgres instance (SUPABASE_DB_URL), bypassing
 * PostgREST/supabase-js entirely, because `realtime.messages` isn't part of the PostgREST-exposed
 * `public` schema — supabase-js has no path to it. Every check below runs inside a Postgres
 * transaction that is ALWAYS rolled back (via `sql.begin` + a thrown sentinel, see
 * `runInRolledBackTransaction`), so nothing here is ever persisted.
 *
 * Two session variables matter for the policy under test:
 * - `request.jwt.claims` — simulates the JWT claims on the connecting client's token (the
 *   `topic` claim minted by lib/realtimeAuth.ts#mintRealtimeToken).
 * - `realtime.topic` — a Postgres GUC that Supabase's real Realtime server sets per-connection to
 *   record which channel the client actually subscribed to; `realtime.topic()` (used by the RLS
 *   policy) just reads this GUC back. It is NOT derived from the `topic` column on any row being
 *   queried — confirmed by reading the function body (`select nullif(current_setting
 *   ('realtime.topic', true), '')`) and by the manual psql verification run before this test was
 *   written (see the phase's chat transcript / PR description for that transcript).
 *
 * The policy under test:
 *   using ( (select realtime.topic()) = (jwt claim 'topic') and extension in (broadcast,presence) )
 * i.e. "you may only read/write messages while connected to the exact channel your JWT's `topic`
 * claim names" — so a token minted for session A must never authorize presence/broadcast while
 * connected to session B's channel, regardless of which topic value rows in the table carry.
 */

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  throw new Error(
    "SUPABASE_DB_URL is not set — this test connects directly to the local Postgres instance " +
      "(see `supabase status` -> DB_URL) to exercise realtime.messages RLS. Set it in .env.local."
  );
}

const sql = postgres(dbUrl, { max: 1 });

afterAll(async () => {
  await sql.end();
});

/** Thrown deliberately from inside `sql.begin` to force a ROLLBACK while still returning a value. */
class RollbackWithResult<T> extends Error {
  constructor(public readonly result: T) {
    super("intentional rollback carrying a result");
  }
}

/**
 * Runs `fn` inside a transaction that is unconditionally rolled back afterward, regardless of
 * whether `fn` succeeds or throws. `fn`'s return value (or thrown error, if not the rollback
 * sentinel) propagates to the caller.
 */
async function runInRolledBackTransaction<T>(
  fn: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      const result = await fn(tx);
      throw new RollbackWithResult(result);
    });
    // sql.begin only resolves normally if the callback didn't throw, which never happens above.
    throw new Error("unreachable: runInRolledBackTransaction should always roll back");
  } catch (err) {
    if (err instanceof RollbackWithResult) {
      return err.result as T;
    }
    throw err;
  }
}

/**
 * Sets up the transaction's simulated connection state: switches to the unprivileged
 * `authenticated` role (matches the RLS policies' `to authenticated`) and sets both GUCs the
 * policy reads.
 */
async function setConnectionState(
  tx: postgres.TransactionSql,
  opts: { jwtTopic: string; connectionTopic: string }
): Promise<void> {
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({
    role: "authenticated",
    topic: opts.jwtTopic,
  })}, true)`;
  await tx`select set_config('realtime.topic', ${opts.connectionTopic}, true)`;
}

/** Seeds a broadcast row for `topic`, run as the `postgres` role (rolbypassrls=true), bypassing RLS. */
async function seedMessage(tx: postgres.TransactionSql, topic: string): Promise<void> {
  await tx`
    insert into realtime.messages (topic, extension, payload, event, private)
    values (${topic}, 'broadcast', '{}', 'test', true)
  `;
}

describe("realtime.messages RLS (supabase/migrations/20260801172541_realtime_authorization.sql)", () => {
  const topicA = `session:${crypto.randomUUID()}`;
  const topicB = `session:${crypto.randomUUID()}`;

  it("denies SELECT when the JWT topic claim does not match the connected channel's topic", async () => {
    const visibleRows = await runInRolledBackTransaction(async (tx) => {
      await seedMessage(tx, topicB);
      await setConnectionState(tx, { jwtTopic: topicA, connectionTopic: topicB });

      return tx`select id from realtime.messages where topic = ${topicB}`;
    });

    expect(visibleRows).toHaveLength(0);
  });

  it("allows SELECT when the JWT topic claim matches the connected channel's topic", async () => {
    const visibleRows = await runInRolledBackTransaction(async (tx) => {
      await seedMessage(tx, topicB);
      await setConnectionState(tx, { jwtTopic: topicB, connectionTopic: topicB });

      return tx`select id from realtime.messages where topic = ${topicB}`;
    });

    expect(visibleRows).toHaveLength(1);
  });

  it("denies INSERT (broadcast) when the JWT topic claim does not match the connected channel's topic", async () => {
    await expect(
      runInRolledBackTransaction(async (tx) => {
        await setConnectionState(tx, { jwtTopic: topicA, connectionTopic: topicB });
        await seedMessage(tx, topicB);
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it("allows INSERT (broadcast) when the JWT topic claim matches the connected channel's topic", async () => {
    const insertedCount = await runInRolledBackTransaction(async (tx) => {
      await setConnectionState(tx, { jwtTopic: topicB, connectionTopic: topicB });
      await seedMessage(tx, topicB);

      const rows = await tx`select id from realtime.messages where topic = ${topicB}`;
      return rows.length;
    });

    expect(insertedCount).toBe(1);
  });

  it("denies SELECT/INSERT for extensions outside broadcast/presence even with a matching topic", async () => {
    const visibleRows = await runInRolledBackTransaction(async (tx) => {
      await tx`
        insert into realtime.messages (topic, extension, payload, event, private)
        values (${topicA}, 'postgres_changes', '{}', 'test', true)
      `;
      await setConnectionState(tx, { jwtTopic: topicA, connectionTopic: topicA });

      return tx`select id from realtime.messages where topic = ${topicA} and extension = 'postgres_changes'`;
    });

    expect(visibleRows).toHaveLength(0);
  });

  it("leaves realtime.messages with zero rows for the test topics after the suite (proves rollback actually happened)", async () => {
    const leftoverRows = await sql`
      select id from realtime.messages where topic in (${topicA}, ${topicB})
    `;

    expect(leftoverRows).toHaveLength(0);
  });
});
