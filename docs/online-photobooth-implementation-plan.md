# Online Photobooth — Implementation Plan & Checklist

Status: Active. Source of truth for **sequencing** — the PRD/TRD/backend-schema/mvp-scope/test-plan/ops-runbook/design-brief docs remain the source of truth for **content**; this doc just orders the remaining work into phases sized for one `dev` → `security-rls-reviewer` → `test-runner` cycle each, per `.claude/agents/*.md`.

Legend: `[GATE]` = readiness check, no dev/security/test cycle. `[RESOLVED]` = a former open-decision checkpoint, now settled. `[BUILD]` = full dev → (security-rls-reviewer if DB/API touched) → test-runner cycle.

**Execution model:** one phase at a time. After each `[BUILD]` phase's test-runner pass reports back, stop and check in before starting the next phase. Do not batch multiple phases silently.

---

## Resolved decisions (former open `[ASSUMPTION]` items)

1. **4-photo login gate scope:** ONE logged-in participant unlocks the 4-photo format for the whole session. Matches the current `app/api/sessions/[id]/upgrade/route.ts` implementation and the docs' stated assumption — no schema change needed.
2. **Dropped participant mid-countdown:** session proceeds with an empty slot for the dropped participant. Matches `participants.status = 'dropped'` already modeled in `backend-schema.md` §3.3.

Once the phases that touch these (Phase 8 for #2, Phase 12 for #1) land, update the `[ASSUMPTION]` language in `docs/online-photobooth-trd.md`, `docs/online-photobooth-backend-schema.md` §8, and `docs/online-photobooth-mvp-scope.md` §7 to state these as decided, per mvp-scope §6's DoD bullet.

---

## Phase 0 — [GATE] Environment & baseline readiness

- [ ] Verify `supabase start` (or equivalent local stack) actually runs — `lib/db/*.test.ts` files hit a **live** Supabase instance, not mocks.
- [ ] Confirm `.env.local` has non-empty values for: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`. `UPSTASH_REDIS_URL`/`TOKEN` optional (rate limiter fails open) but needed before Phase 4/5 for S-06 to be truly testable.
- [ ] Run `npm test` to establish current baseline pass/fail (before any new code lands).
- [ ] Note: current working tree has uncommitted changes (`upgrade/route.ts`, `webhooks/clerk/route.ts`, `layout.tsx`, `middleware.ts`, `package.json`/`lock`, untracked `appUsers.test.ts`). Recommend committing these as a clean baseline before Phase 1 so each phase's diff is reviewable in isolation — will ask before committing anything.
- [ ] Named risk (not closable in-repo): real multi-device network-jitter testing (test-plan §2: throttled 3G, asymmetric) and Safari iOS camera-permission behavior need actual devices — flagged again at Phase 18, not fakeable by an agent.

**Outcome:** report exactly what's live vs. missing; don't claim a phase's tests pass if the underlying service isn't reachable.

---

## Phase 1 — [BUILD] Close out Clerk auth gap (TRD item 2)

- **Files:** `app/api/sessions/[id]/upgrade/route.ts`, `lib/db/sessions.test.ts` (add `updateSessionFormat` coverage).
- **Change:** after resolving `userId` → `app_users` row, verify the acting user is a participant of session `:id` via `lib/db/participants.ts#getParticipantByUserAndSession`. 403 if not a participant (currently any authenticated user can upgrade any session).
- **Note:** this fix is only fully exercisable for solo sessions once Phase 4 makes session creation insert a host `participants` row (see Phase 4). That's an expected ordering artifact, not a bug in Phase 1.
- **Explicitly out of scope:** adding an analytics event or an "upgraded by" column for this action — neither `analytics_events.event` enum nor any table has a slot for it, and inventing one is a schema deviation `dev.md` requires flagging rather than doing silently. Skip it.
- **Done when:** upgrade route 403s for a logged-in non-participant, 200s for a logged-in participant.
- **Test IDs unlocked:** S-04 (strengthened).
- **security-rls-reviewer:** Yes.
- **Depends on:** Phase 0.

---

## Phase 2 — [BUILD] Design tokens & UI primitives (TRD item 3a)

- **Files:** `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `components/ui/Button.tsx`, `components/ui/Card.tsx`, `components/ui/Badge.tsx`.
- **Change:** add design-brief palette (cream `#e6e8f7`, ink `#2B2620`, ink-secondary `#6B6355`, rust `#B14A26`/body-safe `#8C3A1D`, forest `#33422E`, structural-gray `#DCD3C2`, film-black `#141210`), serif + grotesque font pairing, 12–16px radius scale, hairline borders. Implement real `Button` variants (default + illuminated soft-glow circle with a non-color state indicator per A-02), `Card` (cream, hairline border, no shadow), `Badge` variants. Replace default create-next-app metadata/fonts in `layout.tsx`.
- **Done when:** no default Next.js placeholder colors remain in `tailwind.config.ts`; primitives render token-driven styles, not just accept unused variant props.
- **Test IDs unlocked:** A-01 (partial), A-02 (spot-check).
- **security-rls-reviewer:** No.
- **Depends on:** Phase 0. Blocks every later frontend phase (3, 5, 7, 9, 10, 12).

---

## Phase 3 — [BUILD] Landing + mode select + `POST /api/sessions` (TRD item 3b)

- **Files:** `app/(marketing)/page.tsx`, `app/session/new/page.tsx`, `app/api/sessions/route.ts`, `lib/db/sessions.test.ts` (extend if needed).
- **Change:** real landing (3 persona pitches, filmstrip gallery, "Enter the booth →" CTA), mode selection UI, real `POST /api/sessions`: `createSessionSchema` → `checkRateLimit` (IP-keyed, ~10/hr) → `createSession` → **insert a host `participants` row via `addParticipant`** (resolves Phase 1's open ordering note — host is always participant #1, solo or invite) → `{ id, join_url }`.
- **Done when:** landing → mode select → session creation round-trips against live Supabase; rate limit engages on rapid creation; solo mode skips straight toward capture per `flows.md` §1a.
- **Test IDs unlocked:** F-01, F-02, F-03, F-04, S-02 (partial), S-05, S-06.
- **security-rls-reviewer:** Yes.
- **Depends on:** Phase 2.

---

## Phase 4 — [BUILD] Realtime Authorization token minting + `/join` (TRD item 4a)

- **Files (new):** `lib/realtimeAuth.ts` (`mintRealtimeToken(sessionId, participantId)` via `jose` `SignJWT`, signed with `SUPABASE_JWT_SECRET`, short expiry, `session_id` claim), `supabase/migrations/<ts>_realtime_authorization.sql` (Realtime Authorization RLS policy on the channel-topic mechanism — this is distinct from the 9 already-committed table-RLS migrations, per backend-schema §4's own distinction), `lib/db/participants.test.ts`, `lib/realtimeAuth.test.ts`.
- **Files (modify):** `app/api/sessions/[id]/join/route.ts` — real `POST`: `joinSessionSchema` → `checkRateLimit` → `addParticipant` (handle the `unique(session_id, user_id)` re-join case gracefully, don't 500) → `mintRealtimeToken` → `{ participant, realtimeToken }`.
- **Done when:** a token minted for session A cannot authorize presence/broadcast on session B's channel — verify this explicitly.
- **Test IDs unlocked:** F-05, half of F-06, S-01 (end-to-end), S-06.
- **security-rls-reviewer:** Yes — highest-stakes phase in the plan (new RLS surface, token scoping/replay).
- **Depends on:** Phase 1 (participant lookup pattern), Phase 3 (sessions must exist). **Blocks Phase 5 onward** — nothing realtime-related starts before this.

---

## Phase 5 — [BUILD] `lib/realtime.ts` (full) + waiting room UI (TRD item 4b)

- **Files:** `lib/realtime.ts` (all 9 exports: `getSessionChannel`, `setRealtimeAuth`, `trackPresence`, `subscribeToPresence`, `broadcastCountdownStart`/`subscribeToCountdown`, `broadcastCaptureAck`/`subscribeToCaptureAck`, `broadcastShot`/`subscribeToShots`, `leaveSessionChannel`), `app/api/sessions/[id]/route.ts` (real `GET`: session + participants), `app/session/[id]/waiting/page.tsx`, `components/booth/PresenceList.tsx`, `components/booth/ReadyToggle.tsx`.
- **Open design gap to flag when hit:** TRD §5 lists no endpoint for persisting a `participants.status` transition to the DB, only Realtime presence. Decide: DB status transitions happen via ephemeral presence only (simplest, recommended) vs. a new small route calling the already-built `lib/db/participants.ts#updateParticipantStatus`. Flag whichever is chosen.
- **Minor call:** test-plan F-09 leaves "auto-start vs. host-triggered" open — implement auto-start when all `ready` (simpler); flag the choice, don't block on it.
- **Done when:** 3+ browser tabs on the same session see each other live; a session-A client cannot see session-B's presence.
- **Test IDs unlocked:** F-06 (complete), F-07, F-08, first half of F-09.
- **security-rls-reviewer:** Yes.
- **Depends on:** Phase 4, Phase 2.

---

## Phase 6 — [BUILD] Countdown sync + capture (TRD item 5)

- **Files:** `app/session/[id]/capture/CaptureClient.tsx`, `components/booth/CameraView.tsx`, `components/booth/PermissionFallback.tsx` (functional pass), `components/booth/Countdown.tsx`.
- **New minimal API surface to flag:** the host needs an authoritative server time source before broadcasting `countdown_start`. Add a trivial `GET /api/time` → `{ now: Date.now() }` (or read the `Date` response header off an existing call) — pick the minimal option, flag it as new surface beyond TRD §5.
- **Change:** `subscribeToCountdown` → compute clock-offset-corrected local capture time from `serverTimestamp`, schedule via `setTimeout` — **never trigger on broadcast receipt** (TRD §3 hard requirement). Real `getUserMedia` with explicit permission-denied / unsupported-browser (`!navigator.mediaDevices?.getUserMedia`) handling that blocks capture entry (TRD §8). Wire `broadcastCaptureAck`/`subscribeToCaptureAck` and `broadcastShot`/`subscribeToShots`. Implement the resolved empty-slot behavior for a participant who drops mid-countdown.
- **Done when:** 2+ real browser clients capture within sub-second wall-clock drift on the same network; camera-denied/unsupported both block entry with a message, not a hang.
- **Test IDs unlocked:** F-09 (complete), F-10 (automatable baseline), F-12, F-13, F-14.
- **security-rls-reviewer:** Light touch on `/api/time` only (confirm it leaks nothing but a timestamp).
- **Depends on:** Phase 5.

---

## Phase 7 — [BUILD] Preview/retake UI (TRD item 6)

- **Files:** `app/session/[id]/preview/PreviewClient.tsx`.
- **Change:** display own + relayed shots; retake-individual-shot flow that only replaces the retaken shot.
- **Done when:** retaking shot N doesn't disturb others; repeated retakes have no stale-state bug.
- **Test IDs unlocked:** F-15, F-16, F-17.
- **security-rls-reviewer:** No.
- **Depends on:** Phase 6.

---

## Phase 8 — [BUILD] Style picker + `compositor.ts` (TRD item 7)

- **Files:** `lib/compositor.ts` (`computeStripLayout` — pure geometry, unit-testable; `drawStrip` — Canvas, browser-exercised), `app/session/[id]/style/StyleClient.tsx`, `components/booth/StylePicker.tsx`, `components/booth/StripPreview.tsx`, `lib/compositor.test.ts` (both formats × all 4 `STYLE_PRESETS`).
- **Done when:** switching presets updates the preview each time with no stale bleed; layout geometry correct for 3- and 4-photo formats.
- **Test IDs unlocked:** F-18, F-19.
- **security-rls-reviewer:** No.
- **Depends on:** Phase 7.

---

## Phase 9 — [BUILD] Storage helper + strips API (TRD item 8a)

- **Files (new):** `lib/storage.ts` (`uploadStripImage`, `mintSignedStripUrl` 5–15 min expiry, `deleteStripImage` against the private `strips` bucket), `lib/db/strips.test.ts`, `lib/storage.test.ts`.
- **Files (modify):** `app/api/strips/route.ts` — real `POST`: `createStripSchema` → **server-side check that submitted photo count matches `sessions.format`** (closes format-smuggling) → upload at `strips/{session_id}/{strip_id}.png` → `createStrip` (stores `storage_path`, never a baked URL) → mint fresh signed URL for the response. `app/api/strips/[id]/route.ts` — real `GET`: `getStripById` (404) → mint a fresh signed URL every call, never cache/reuse.
- **Done when:** mismatched photo count rejected before Storage/DB; two calls to `GET /api/strips/:id` after expiry return two different valid URLs (S-03).
- **Test IDs unlocked:** S-03.
- **security-rls-reviewer:** Yes.
- **Depends on:** Phase 8. Blocks Phase 10 and Phase 11.

---

## Phase 10 — [BUILD] Output UI: login gate, download/share/print, public view (TRD item 8b)

- **Files:** `app/session/[id]/generate/GenerateClient.tsx` (resolved one-participant-unlocks-all login gate: inline Clerk sign-in at generate time for 4-photo, resumes post-login, calls `/upgrade` then `POST /api/strips`), `app/session/[id]/output/page.tsx`, `components/booth/OutputActions.tsx` (real download/native-share/print-ready export — not mail-out), `components/booth/StickerOverlay.tsx` (optional toggle layer), `app/strip/[id]/page.tsx` (public view, no auth/join required, calls `GET /api/strips/:id`).
- **Done when:** F-20 through F-29 pass functionally; a strip's share link is viewable by someone who never joined and isn't logged in.
- **Test IDs unlocked:** F-20, F-21, F-22, F-23, F-24, F-25, F-26, F-27, F-28, F-29.
- **security-rls-reviewer:** Light touch (confirm `strip/[id]` truly needs no auth and doesn't leak other sessions' data).
- **Depends on:** Phase 9.

---

## Phase 11 — [BUILD] Analytics event wiring (TRD item 9a)

- **Files:** `lib/analytics.ts` (real `trackEvent` wrapping `lib/db/analyticsEvents.ts#recordEvent`), `app/api/sessions/route.ts` (fire `session_started`), `app/api/strips/route.ts` (fire `strip_completed`), `lib/db/analyticsEvents.test.ts`, `lib/analytics.test.ts`.
- **Done when:** session creation inserts `session_started`; strip completion inserts `strip_completed`; `user_id` correctly null for anonymous.
- **Test IDs unlocked:** None directly (flag explicitly, matching test-runner.md's own instruction for no-ID items) — verify by querying `analytics_events` after Phase 3/10 flows run.
- **security-rls-reviewer:** Yes (lightweight — confirm server-side only).
- **Depends on:** Phase 3, Phase 10.

---

## Phase 12 — [BUILD] Cron jobs: daily-metrics + expire-sessions (TRD item 9b)

- **Files:** add `CRON_SECRET` to `.env.local.example` (currently referenced in stub comments but missing from both the example file and the ops-runbook doc — flag the doc gap). `app/api/cron/daily-metrics/route.ts` — `CRON_SECRET` bearer guard → aggregate via `getEventsBetween` → upsert `daily_metrics` (add `upsertDailyMetrics` to `lib/db/analyticsEvents.ts` or a new `lib/db/dailyMetrics.ts`). `app/api/cron/expire-sessions/route.ts` — `CRON_SECRET` guard → mark newly-past-TTL sessions via `getExpiredSessions`/`expireSession` → **delete each strip's Storage object via `lib/storage.ts#deleteStripImage` before the cascade delete runs** (Postgres cascades never touch Storage). Extend `lib/db/sessions.test.ts` for `getExpiredSessions`/`expireSession`.
- **Done when:** expired session's participants/strips/Storage objects all gone after a sweep; `daily_metrics` reflects real counts; both routes reject requests without the correct secret.
- **Test IDs unlocked:** D-01. (D-02 already covered by the Clerk webhook; D-03 not applicable — no manual delete path in MVP scope.)
- **security-rls-reviewer:** Yes.
- **Depends on:** Phase 9, Phase 11.

---

## Phase 13 — [BUILD] Responsive pass + error/edge states (TRD item 10)

- **Files:** `components/booth/SessionExpired.tsx` (real messaging tied to Phase 12's cron), `components/booth/PermissionFallback.tsx` (visual polish), mobile-first pass across all pages from Phases 2–10 (full-bleed capture/console, instruction strip collapses to single horizontal scroll row per design brief §5), keyboard nav + screen-reader labeling (A-03, A-04), final WCAG AA contrast re-check at real component sizes (A-01 final).
- **Done when:** R-01/R-02/R-03 pass on real mobile viewports; A-01–A-04 pass; dropped-participant and expired-session states both show explicit, non-broken UI.
- **Test IDs unlocked:** R-01, R-02, R-03, A-01 (final), A-02 (final), A-03, A-04.
- **security-rls-reviewer:** No.
- **Depends on:** Phases 2–10, 12.

---

## Phase 14 — [BUILD] Infra/ops: CI, type-check, cron scheduling, README

Can run near-parallel with Phase 13/15 — doesn't block core flow.

- **Files:** `package.json` (add `"type-check": "tsc --noEmit"`), `.github/workflows/ci.yml` (lint → type-check → test → build, branch-protect `main`), `vercel.json` (`"crons"` scheduling `daily-metrics` nightly and `expire-sessions` hourly), `README.md` (real setup: env vars incl. `SUPABASE_JWT_SECRET`/`CRON_SECRET` gaps, `supabase start`/`db push`, Clerk webhook config, `npm test`).
- **Done when:** a broken type/failing test blocks merge to `main`; both cron routes actually fire on schedule; a new contributor can follow the README unaided.
- **Test IDs unlocked:** None directly — prerequisite for CI-gated confidence on everything else.
- **security-rls-reviewer:** Light touch (no secrets echoed into CI logs/`vercel.json`).
- **Depends on:** Phase 12.

---

## Phase 15 — [BUILD] Sentry error tracking

Must run after Phase 6 and Phase 12 (instruments code written there); can run near-parallel with 13/14.

- **Files:** `package.json` (`@sentry/nextjs`), Sentry config files per the installed SDK version's current convention, `next.config.mjs` wrap. Instrument: countdown drift outliers + camera permission denials (`CaptureClient.tsx`/`CameraView.tsx`, Phase 6), cron job failures (both cron routes, Phase 12).
- **Done when:** a forced error at each of the three instrumented spots shows up in Sentry with the right tag.
- **Test IDs unlocked:** None directly — supports ops-runbook §8 incident response.
- **security-rls-reviewer:** No (spot-check `SENTRY_DSN` stays server-side where possible).
- **Depends on:** Phase 6, Phase 12.

---

## Phase 16 — [GATE] Final end-to-end verification (mvp-scope §6 Definition of Done)

Walk every DoD bullet explicitly:

| DoD bullet | Verified by |
|---|---|
| PRD functional requirements 1–11, all 3 personas, end-to-end | Full manual run: solo, invite/friend-group, LDR-style asymmetric-network run (manual) |
| Backend schema deployed, RLS enabled, zero permissive policies | Phase 0 migrations + Phase 4's new Realtime Authorization migration, re-confirmed across all security-rls-reviewer passes |
| Countdown drift sub-second, ≥3 participants, differing networks | Phase 6 mechanism + **manual network-matrix pass (test-plan §2)** — not automatable |
| Camera-denied / unsupported-browser fallback | Phase 6 + Phase 13 |
| Session expiry/cleanup cascades correctly | Phase 12, D-01 |
| Analytics events firing, feeding `daily_metrics` | Phase 11 + Phase 12 |
| Responsive pass complete, mobile full-bleed | Phase 13, R-01/R-02/R-03 |
| Both open assumptions resolved, not ambiguous in prod | Resolved above; doc updates land in Phase 6 and Phase 10 |

Re-run `npm test` plus a manual pass against every F/S/D/P/A/R id in `docs/online-photobooth-test-plan.md`.

---

## Dependency summary

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 16
                                            └→ 13 (needs 2-10,12)
                                            └→ 14 (needs 12)
                                            └→ 15 (needs 6,12)
```

Phases 13, 14, 15 are the only ones that can run near-parallel with each other and the tail of 9–12 without blocking core-flow progress.
