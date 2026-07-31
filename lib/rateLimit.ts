import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
}

// Lazily built so we don't reach for env vars (or throw) at module load time —
// routes that import this file should work even before Upstash is provisioned.
let redis: Redis | undefined;
let warnedUnconfigured = false;

function getRedis(): Redis | undefined {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;

  if (!url || !token) {
    if (!warnedUnconfigured) {
      console.warn(
        "[rateLimit] UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN are not set — rate limiting is disabled (failing open) until an Upstash project is provisioned."
      );
      warnedUnconfigured = true;
    }
    return undefined;
  }

  redis = new Redis({ url, token });
  return redis;
}

// One Ratelimit instance per unique (limit, windowSeconds) pair. This is not
// pooled/cached beyond a simple Map keyed by the pair — correctness over
// cleverness, since call sites only ever use a handful of distinct configs.
const limiters = new Map<string, Ratelimit>();

function getLimiter(client: Redis, opts: RateLimitOptions): Ratelimit {
  const key = `${opts.limit}:${opts.windowSeconds}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowSeconds} s`),
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/**
 * Checks whether `identifier` is within the given rate limit.
 *
 * Deliberate fail-open behavior: if Upstash isn't configured (no
 * UPSTASH_REDIS_URL / UPSTASH_REDIS_TOKEN — the current state of this repo,
 * no Upstash project provisioned yet), this logs a single console.warn and
 * returns `{ success: true }` instead of throwing. Rate limiting here is an
 * anti-abuse layer, not an authorization check, so failing open when the
 * backend isn't configured is acceptable — it shouldn't block local dev or
 * break every route before Upstash is provisioned. Do not "fix" this to fail
 * closed; that would take down all API routes any time Redis is unreachable.
 */
export async function checkRateLimit(
  identifier: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const client = getRedis();
  if (!client) {
    return { success: true };
  }

  const limiter = getLimiter(client, opts);
  const { success } = await limiter.limit(identifier);
  return { success };
}
