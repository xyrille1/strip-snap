# Ops Runbook — Online Photobooth

Status: Draft v1 — covers deployment, CI/CD, error tracking, and backup/recovery. Fills the four gaps identified against the 13-layer infra checklist (hosting/deployment, CI/CD, error tracking/logs, availability/recovery); the other layers are already addressed in the TRD, backend schema doc, and MVP scope doc.

## 1. Environments

Two environments only for MVP — no staging tier, since the free-tier/no-deadline constraints in the MVP scope doc don't justify the extra infra yet:

| Environment    | Purpose                                                  | URL pattern                     |
| -------------- | -------------------------------------------------------- | ------------------------------- |
| **Preview**    | Every PR/branch gets an auto-deployed Vercel preview URL | `<branch>-<project>.vercel.app` |
| **Production** | The live app                                             | custom domain, mapped to `main` |

If a staging environment becomes necessary later (e.g., before a schema migration that's risky to run straight to prod), add a `staging` branch mapped to a second Vercel project pointing at a separate Supabase project — not needed at MVP launch.

## 2. Environment variables

| Variable                            | Where used                                             | Exposure                                                              |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | Client + server                                        | Public                                                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Client (Realtime channel auth only, per schema doc §4) | Public                                                                |
| `SUPABASE_SERVICE_ROLE_KEY`         | Server-side API routes only                            | **Secret — never in `NEXT_PUBLIC_*`**                                 |
| `CLERK_SECRET_KEY`                  | Server-side auth verification                          | **Secret**                                                            |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client                                                 | Public                                                                |
| `SENTRY_DSN`                        | Error tracking (§4)                                    | Secret (write-only DSN, low risk but keep server-side where possible) |
| `UPSTASH_REDIS_URL` / token         | Rate limiting (per backend schema §5)                  | **Secret**                                                            |

All secrets live in Vercel's Environment Variables UI, scoped per environment (Preview vs. Production get separate Supabase projects/keys — never share a production database with preview deploys, to avoid preview traffic polluting production data or hitting production rate limits).

## 3. Deployment

**Flow:** GitHub → Vercel (connected via the Vercel GitHub integration, auto-deploy on push).

- Push to any branch → Vercel builds a Preview deployment automatically, no manual step.
- Merge to `main` → auto-deploys to Production.
- Supabase migrations are **not** auto-applied on deploy — they're a separate manual/CI step (§5), since an app deploy and a schema migration should be able to fail independently without corrupting each other.

**Rollback:** Vercel keeps every previous deployment; rolling back Production is "promote a previous deployment" in the Vercel dashboard — no rebuild needed, near-instant. Database rollback is separate and harder (§6) — a Vercel rollback does not undo a bad migration.

## 4. CI pipeline

Runs on every push via GitHub Actions (free for public/small private repos):

```yaml
# .github/workflows/ci.yml (outline)
on: [push, pull_request]
jobs:
  ci:
    steps:
      - checkout
      - install dependencies
      - lint (eslint)
      - type-check (tsc --noEmit)
      - unit/integration tests (per test plan §3–§4 automatable subset)
      - build (next build) — catches build-time errors before Vercel does
```

Vercel's own build step is the deploy gate; this CI workflow is a faster, cheaper first check that fails PRs before a Vercel build is even attempted. Branch protection on `main` should require this workflow to pass before merge.

## 5. Database migrations

- Managed via Supabase CLI migrations (`supabase migration new`, `supabase db push`), committed to the repo alongside the code that depends on them — the schema doc's SQL (§3 of `online-photobooth-backend-schema.md`) is the source these migrations are written from.
- Migrations run as a manual or CI-triggered step against the target Supabase project, **not** automatically on every Vercel deploy — this keeps a bad migration from being an unrecoverable part of an otherwise-fine app deploy.
- Order: apply migration first, confirm it succeeded, then deploy the app code that depends on the new schema shape. Reverse order (app first) risks the app hitting a schema it doesn't expect yet.

## 6. Backup & recovery

- Supabase's free tier includes daily automatic backups with limited retention (verify current retention window on the Supabase dashboard at setup time, since free-tier terms can change) — this is the baseline safety net and requires no extra setup.
- **Point-in-time recovery is a paid Supabase feature**, not available on free tier — worth naming explicitly as a known gap: a bad migration or accidental delete can only be rolled back to the last daily backup, not to an arbitrary point in time, until/unless the project upgrades tiers.
- Before running any destructive migration (dropping/altering a column with data in it), take a manual export via `supabase db dump` as a local safety copy — cheap insurance the daily backup alone doesn't guarantee timing-wise.
- Storage (finalized strip images) is not covered by Postgres backups — Supabase Storage has its own durability guarantees, but there's no separate export step needed at MVP scale since strips are ephemeral by design (24h session TTL, per schema doc §7) and not treated as permanent records.

## 7. Error tracking & logs

- **Sentry (free tier)** wired into both the Next.js app (client + server) and, if used, edge functions — catches unhandled exceptions in the capture/countdown/compositing flow, which is exactly where the TRD's identified risks (camera denial, participant drops, network jitter) would otherwise fail silently in production with no visibility.
- Key events to explicitly instrument beyond default error capture: countdown drift outliers, camera permission denials, and session-expiry-cleanup job failures — these map directly to the risks flagged in the TRD (§8) and are the ones most likely to explain a drop in the session-start → strip-completed conversion metric the PRD cares about.
- Vercel's built-in function logs cover request-level API route failures; Sentry is for application-level exceptions and the events above. Both are free-tier-compatible and require no infra beyond an account + SDK install.
- No dedicated log aggregation service (e.g., Datadog) is in scope for MVP — Vercel logs + Sentry are sufficient at this volume; revisit only if usage outgrows what's visible there.

## 8. Incident checklist (lightweight)

For a solo/small-team MVP, this is intentionally short — not a formal on-call process:

1. Check Sentry for the error signature.
2. Check Vercel deployment logs for the affected function/route.
3. If caused by a bad deploy — roll back via Vercel dashboard (§3), near-instant.
4. If caused by a bad migration — restore from the latest Supabase backup or manual dump (§6); note this is slower and lossier than a Vercel rollback, so migrations should be tested against a preview/local Supabase instance first, not applied directly to production.
5. Log what happened and the fix in a running incidents note (even a plain doc) — useful once there's enough history to spot a pattern, not needed as tooling yet.

## 9. What's intentionally not here

Per the MVP scope doc's out-of-scope list: no load balancer config, no multi-region setup, no formal on-call rotation/paging tool, no log aggregation platform beyond Vercel/Sentry. All of these are free-tier-appropriate omissions, not oversights — they're the first things to add if usage outgrows this setup, not before.
