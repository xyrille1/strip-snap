# Technical Requirements Document — Online Photobooth

Status: Draft v1 — derived from PRD v1. `[ASSUMPTION]` tags mark gaps filled by the CTO where the PRD left it open.

## 1. Overview

A browser-based, real-time synced photobooth. Solo, friend-group, and LDR sessions share one flow: join → synced countdown → capture → composite → output. MVP optimizes for free-tier hosting and validated usage, not scale.

## 2. Tech Stack

```
Language:     TypeScript
Framework:    Next.js 14 (App Router)
Styling:      Tailwind CSS
Auth:         Clerk (email/password + Google)
Database:     PostgreSQL via Supabase (free tier)
Realtime:     Supabase Realtime (Presence + Broadcast channels)
Storage:      Supabase Storage (free tier) — finalized strips only
Capture:      getUserMedia (WebRTC) + Canvas API, client-side
Hosting:      Vercel (app) + Supabase (DB/Realtime/Storage), both free tier
```
Reason: matches existing stack conventions (Next.js/TS/Supabase/Tailwind); Supabase Realtime covers presence + countdown sync without a separate WebSocket server, keeping everything on free tiers.

## 3. System Architecture

```
Browser (participant A) ─┐
Browser (participant B) ─┼─ Supabase Realtime channel: session:{id}
Browser (participant N) ─┘        (presence + broadcast events)
        │
        ▼
Next.js app (Vercel)
        │
        ├─ API routes ── Supabase Postgres (sessions, participants, strips)
        ├─ Clerk ─────── auth, login gate for 4-photo format
        └─ Supabase Storage ── finalized strip images only
```

**Data flow:** host creates session → shareable link generated → participants join channel `session:{id}` → each client posts `ready` presence state → when all ready, one client (host) broadcasts `countdown_start` with a server-fetched timestamp `T` → each client locally schedules capture at `T` (not on receipt) to neutralize network jitter → each client captures locally via `getUserMedia` → shots held in browser memory (never uploaded) → user previews/retakes → client composites final strip via Canvas → only the finished strip is uploaded to Supabase Storage → signed/unguessable URL returned for download/share/print.

**Key decisions:**
- Countdown anchored to a server timestamp, not "broadcast receipt time," to hit sub-second drift despite unequal network latency.
- Raw shots stay client-side; only the composited strip touches storage — satisfies the client-side-processing privacy requirement and cuts storage/bandwidth.
- Share/access via unguessable `session_id`/`strip_id` (UUIDv4), not sequential IDs.

## 4. Data Models

```
sessions
  id            uuid pk
  host_clerk_id text null        -- null if host never logged in
  format        enum('3','4')
  status        enum('waiting','counting','capturing','done','expired')
  created_at    timestamptz
  expires_at    timestamptz      -- [ASSUMPTION] 24h TTL for abandoned sessions

participants
  id            uuid pk
  session_id    uuid fk -> sessions
  clerk_id      text null        -- null for anonymous solo/3-photo users
  display_name  text
  joined_at     timestamptz
  status        enum('connected','ready','captured')

strips
  id            uuid pk
  session_id    uuid fk -> sessions
  style_preset  text
  image_url     text             -- Supabase Storage signed URL
  created_at    timestamptz

analytics_events
  id            uuid pk
  session_id    uuid fk -> sessions
  event         enum('session_started','strip_completed')
  clerk_id      text null
  created_at    timestamptz
```
`[ASSUMPTION]` (per PRD): one logged-in participant unlocks the 4-photo format for the whole session — enforced at `sessions.format` write time, checked against `participants` at session creation/upgrade.

## 5. API / Interface Design

```
POST   /api/sessions              create session (mode, format) → { id, join_url }
GET    /api/sessions/:id          fetch session + participant state
POST   /api/sessions/:id/join     join via link → adds participant row
POST   /api/sessions/:id/upgrade  logged-in participant upgrades format to 4-photo
POST   /api/strips                upload composited strip → { image_url }
GET    /api/strips/:id            fetch strip for share/download/print view

Realtime channel: session:{id}
  presence: { participant_id, status }
  broadcast: countdown_start { server_ts }, capture_ack { participant_id }
```

## 6. Module Breakdown

- `app/(marketing)/page.tsx` — landing page, 3 persona pitches, "start session" CTA
- `app/session/new/page.tsx` — mode selection (solo / invite)
- `app/session/[id]/waiting/page.tsx` — invite link, live presence list
- `app/session/[id]/capture/page.tsx` — countdown + `getUserMedia` capture
- `app/session/[id]/preview/page.tsx` — retake individual shots
- `app/session/[id]/style/page.tsx` — filter/preset picker
- `lib/realtime.ts` — Supabase channel helpers (presence, broadcast, countdown scheduling)
- `lib/compositor.ts` — Canvas-based strip compositing (format + style presets)
- `lib/analytics.ts` — event tracking wrapper
- `middleware.ts` — Clerk auth gate on `/upgrade` and account-only routes

## 7. Implementation Order

1. Supabase schema + migrations (`sessions`, `participants`, `strips`, `analytics_events`)
2. Clerk auth integration + 4-photo login gate
3. Landing page + mode selection + session creation API
4. Realtime channel: join flow, waiting room, presence
5. Countdown sync (server-timestamp scheduling) + client capture via `getUserMedia`
6. Preview/retake UI
7. Style preset picker + `compositor.ts`
8. Output: download, native share, print-ready export
9. Analytics event wiring
10. Responsive pass + error states (camera denied, participant drop, expired session)

## 8. Risks & Mitigations

- **Countdown drift** — mitigate with server-anchored timestamp scheduling (§3), not receipt-time triggers.
- **Realtime free-tier connection caps** — acceptable at MVP validation volume (100 sessions/30 days); revisit if repeat usage scales faster than expected.
- **Camera permission denial / unsupported browser** — explicit fallback message; block entry to capture step, not silent failure.
- **Participant drops mid-countdown** — session proceeds with remaining `ready` participants; dropped participant's slot marked empty in the strip. `[ASSUMPTION]` — confirm if this is acceptable vs. blocking capture until reconnect.
- **Share-link guessing** — UUIDv4 IDs, no sequential/incremental identifiers anywhere in the public API.

## Handoff to Programmer

Build in the order in §7. Use the data models in §4 as the schema source of truth — do not deviate without flagging it. Countdown logic must use the server-timestamp pattern in §3; do not trigger capture on broadcast receipt. Ask for clarification only on the two `[ASSUMPTION]` items (4-photo upgrade scope, dropped-participant handling) — everything else in this document is decided.
