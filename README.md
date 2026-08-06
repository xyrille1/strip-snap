# Strip Snap — Online Photobooth

A web-based photobooth that lets people create retro-style, multi-shot photo strips without visiting a mall booth. One shared flow serves three use cases: solo users making a quick strip for social media, friend groups running a shared virtual session, and long-distance partners who want to feel like they took a photo together despite being apart — via a server-synced countdown and simultaneous capture across participants.

See `docs/online-photobooth-prd.md`, `docs/online-photobooth-trd.md`, and `docs/online-photobooth-mvp-scope.md` for the full product/architecture spec.

## Tech stack

- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — Postgres, Realtime (presence/broadcast), Storage (private `strips` bucket), Row Level Security
- **Clerk** — auth (email/password + Google), required only to unlock the 4-photo strip format
- **Upstash Redis** — rate limiting (optional; fails open if not configured)
- **Vitest** — test runner

## Prerequisites

- Node.js 22+ (required by `@supabase/supabase-js`'s Realtime client, which needs native `WebSocket` support)
- [Docker](https://www.docker.com/) (required by the Supabase CLI's local dev stack)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (already a devDependency — invoke via `npx supabase`, or install globally)
- A [Clerk](https://clerk.com/) account (free tier is fine)

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in real values:

| Variable | Where it's used | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client (Realtime channel auth only) | Public |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side API routes only | **Secret** |
| `SUPABASE_DB_URL` | Direct Postgres connection, only used by `supabase/migrations/*.test.ts` to exercise RLS policies outside the PostgREST-exposed schema (e.g. `realtime.messages`) | **Secret** (local dev only) |
| `SUPABASE_JWT_SECRET` | Signs the short-lived per-participant Realtime Authorization token minted by `/join` (`lib/realtimeAuth.ts`) | **Secret** |
| `CLERK_SECRET_KEY` | Server-side auth verification | **Secret** |
| `CLERK_WEBHOOK_SECRET` | Verifies `/api/webhooks/clerk` signatures (svix) | **Secret** |
| `SENTRY_DSN` | Error tracking (not yet wired up — planned) | Secret (write-only DSN, low risk) |
| `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` | Rate limiting | **Secret** (optional — rate limiter fails open if unset) |
| `CRON_SECRET` | Bearer-token guard on `/api/cron/daily-metrics` and `/api/cron/expire-sessions` (`lib/cronAuth.ts`), matching Vercel Cron's `Authorization: Bearer $CRON_SECRET` convention | **Secret** |

> **Doc gap:** `SUPABASE_JWT_SECRET`, `SUPABASE_DB_URL`, and `CRON_SECRET` were added to `.env.local.example` across earlier build phases but were never added to `docs/online-photobooth-ops-runbook.md` §2's own env var table — that table currently omits all three. Not fixed here; flagging for whoever next touches the ops runbook.

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the local Supabase stack** (Postgres, Storage, Realtime, Studio, all via Docker):

   ```bash
   npx supabase start
   ```

   This also applies every migration under `supabase/migrations/` automatically on first start. Run `npx supabase status` to see the local API URL, anon key, service role key, JWT secret, and DB URL — copy those into the matching `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` / `SUPABASE_DB_URL` entries in `.env.local`.

   If you add a new migration later, apply it locally with:

   ```bash
   npx supabase migration up
   ```

   To push migrations to a hosted Supabase project (staging/production), use:

   ```bash
   npx supabase db push
   ```

3. **Set up Clerk**

   - Create an application at [dashboard.clerk.com](https://dashboard.clerk.com), enable email/password and Google sign-in.
   - Copy the publishable key and secret key into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
   - In the Clerk dashboard, add a webhook endpoint pointing at `/api/webhooks/clerk` on a URL Clerk can reach (your Vercel preview/production URL, or a local tunnel such as `ngrok`/`cloudflared` for local testing). Subscribe to `user.created`, `user.updated`, and `user.deleted`.
   - Copy the webhook's signing secret into `CLERK_WEBHOOK_SECRET`.

4. **(Optional) Set up Upstash Redis** for rate limiting — create a database at [upstash.com](https://upstash.com/) and fill in `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN`. The rate limiter fails open (allows the request) when these are unset, so this can be skipped for local development.

5. **Generate a `CRON_SECRET`** (a random per-environment value — never reuse the same one across dev/preview/production):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Running the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Running tests

```bash
npm test
```

Most of the suite (`lib/db/*.test.ts`, most of `app/api/**/*.test.ts`, `lib/storage.test.ts`, `lib/analytics.test.ts`, `supabase/migrations/*.test.ts`) runs as **integration tests against a live local Supabase instance** — make sure `npx supabase start` is running and `.env.local` is populated before running `npm test`, or those tests will fail to connect. The remaining tests (validation schemas, rate limiting, compositor geometry, countdown sync math, capture burst/resolution helpers, `lib/realtime.ts` against a mocked client, etc.) are pure unit tests with no external dependency.

Other useful commands:

```bash
npm run lint        # eslint
npm run type-check  # tsc --noEmit
npm run build       # next build
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: lint → type-check → test → build, in that order (cheapest checks fail fastest). Because most of the test suite needs a live Supabase instance, the workflow provisions one ephemerally via the official [`supabase/setup-cli`](https://github.com/supabase/setup-cli) action and `supabase start` (Docker-based, same local stack described above) before running `npm test`, then tears it down afterward. No real secrets are required for CI — Clerk is mocked in every test that touches an authenticated route, and the Supabase credentials used are freshly generated, ephemeral local-dev values pulled from `supabase status` at run time.

## Deployment

Deployed on **Vercel** (app) + **Supabase** (database/storage/realtime), per `docs/online-photobooth-ops-runbook.md`:

- Push to any branch → Vercel auto-builds a Preview deployment; merge to `main` → auto-deploys to Production.
- Supabase migrations are **not** auto-applied on deploy — run `npx supabase db push` against the target project as a separate step, and confirm it succeeded, *before* deploying app code that depends on the new schema.
- Set every secret in the table above in Vercel's Environment Variables UI, scoped separately per environment (Preview and Production should point at separate Supabase projects — never share a production database with preview deploys).
- `vercel.json` schedules the two cron routes (`daily-metrics` nightly, `expire-sessions` hourly) via Vercel Cron. Once `CRON_SECRET` is set as a Vercel environment variable, Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET` on each invocation, which is exactly what `lib/cronAuth.ts` already expects — no additional wiring needed.

See the ops runbook for rollback, backup/recovery, and incident-response details.
