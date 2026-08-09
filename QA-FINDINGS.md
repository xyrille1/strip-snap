# QA pass — 2026-08-06

Driven end-to-end with a headless Chromium (fake camera device) through the
solo flow: landing → mode select → capture → preview → style → generate →
output → public `/strip/:id` view. Screenshots and console/network logs are
in the session scratchpad if you want to re-check anything.

## 🔴 Must fix

- [x] **Solo strips render as a mostly-empty grid instead of one full-frame photo per slot.** — **Fixed 2026-08-06.**
  `POST /api/sessions` now mints a Realtime token for the host participant it
  already inserts and returns `{ participant, realtimeToken }` alongside
  `join_url` ([app/api/sessions/route.ts](app/api/sessions/route.ts)).
  `ModeSelectClient` stores that identity via `saveStoredParticipant` before
  navigating to `/capture` for solo mode
  ([app/session/new/ModeSelectClient.tsx](app/session/new/ModeSelectClient.tsx)),
  so `CaptureClient`'s identity-resolution effect finds it in
  `sessionStorage` and never calls `/join` at all — no second `Guest` row is
  ever created, closing the structural bug. As defense-in-depth against the
  race (in case the fallback `/join` path is ever hit — e.g. sessionStorage
  cleared mid-flow, or a duplicate effect invocation), that path is now
  guarded by a ref (`joinRequestedRef`) so it can only fire once per mount
  ([app/session/[id]/capture/CaptureClient.tsx](app/session/%5Bid%5D/capture/CaptureClient.tsx)).
  Verified: solo sessions now report exactly 1 participant row via a live
  `POST /api/sessions` + `GET /api/sessions/:id` round trip against local
  Supabase; full test suite (229 tests) and `tsc --noEmit` both pass.
  **Independently re-confirmed 2026-08-06** by re-running the original
  headless-browser repro end-to-end against the live dev server post-fix:
  the session now reports exactly 1 participant (`Host`), and every frame
  on the style preview, the "developing" reveal, the output page, and the
  public `/strip/:id` page fills its slot edge-to-edge with no black
  gaps — visually confirmed via screenshot, not just the participant count.
  Every solo session ends up with **3 participant rows** in the database
  (`Host` + two duplicate `Guest` rows) instead of 1. The compositor
  (`lib/compositor.ts`'s `computeSubRegions`) sees `participantCount: 3`,
  subdivides each slot into a 2×2 grid, and only fills the one cell that
  belongs to the browser's actual identity — the other 3 cells stay
  film-black. This is 100% reproducible (confirmed on 3 separate solo runs)
  and shows up everywhere: the live style-picker preview
  (`app/session/[id]/style/StyleClient.tsx`), the "developing" reveal and
  final "Ready" screen (`app/session/[id]/generate/GenerateClient.tsx`,
  `app/session/[id]/output/OutputClient.tsx`), the downloaded PNG, and the
  public `/strip/:id` share page. Two separate bugs stack to cause it:

  - [x] **Structural — solo sessions get two disconnected identities.**
    `POST /api/sessions` always inserts a `Host` participant row
    ([app/api/sessions/route.ts:63-67](app/api/sessions/route.ts#L63-L67)),
    but solo mode's `CaptureClient` *also* calls `/join` on its own (by
    design — see the comment at
    [app/session/[id]/capture/CaptureClient.tsx:56-61](app/session/%5Bid%5D/capture/CaptureClient.tsx#L56-L61)),
    creating a second `Guest` row nobody reconciles with the host row. A
    solo session should have exactly one participant row, or the compositor
    needs to know to treat host+solo-joiner as the same person.
  - [x] **Race — the join call itself double-fires.** `CaptureClient`'s
    identity-resolution effect
    ([app/session/[id]/capture/CaptureClient.tsx:254-319](app/session/%5Bid%5D/capture/CaptureClient.tsx#L254-L319))
    has no guard against firing twice before `saveStoredParticipant` writes
    to `sessionStorage`. Anonymous joins are explicitly exempt from the
    unique-participant constraint
    ([app/api/sessions/[id]/join/route.ts:109-117](app/api/sessions/%5Bid%5D/join/route.ts#L109-L117)),
    so both calls succeed and create two distinct `Guest` rows ~10ms apart.
    Observed in every test run, so this isn't StrictMode-only — worth
    tracing why it fires twice in a plain `next dev` (non-strict?) render
    too before assuming a fix.

  Fixing only the race (dedupe the double `/join`) still leaves solo
  sessions at `participantCount: 2` (Host + one real Guest) and the strip
  still broken — both need addressing.

- [x] **Invite-mode sessions get the same duplicate-participant bug as solo — group collage renders as a 3-participant grid instead of a clean 2-participant split.** — **Found and fixed 2026-08-07**, while covering the "Invite others" multiplayer path this pass originally skipped.
  Same root cause as the solo bug above, on the invite path: `POST /api/sessions`
  inserts a `Host` participant row for the session creator, but the creator
  *also* goes through the waiting room's name-entry form like every other
  invitee and calls `/join`, creating a second, disconnected row for
  themselves. A 2-person invite session (creator + one real guest) ends up
  with **3 participant rows** (`Host` + creator's chosen name + guest's
  name), so the compositor renders a 2×2 grid instead of a clean 2-column
  split, leaving 2 of the 4 cells black.

  Reproduced live: drove two headless-browser contexts through the full
  invite flow (create → waiting room → both join → both ready → synced
  countdown → capture → style). DB showed 3 rows (`Host`, `Alex`, `Sam`) for
  2 real participants; canvas pixel sampling on the style-preview confirmed
  a 2×2 grid with only the top row populated.

  Fix: `ModeSelectClient` now stores the creator's `Host` identity (from
  `POST /api/sessions`'s response) for BOTH modes, not just solo
  ([app/session/new/ModeSelectClient.tsx](app/session/new/ModeSelectClient.tsx)).
  The invite creator still goes through the waiting room's name-entry form
  (they keep the ability to pick their own display name) — but `/join` now
  accepts an optional `participantId` and, when it's present and matches an
  existing anonymous row in that session, **renames that row in place**
  instead of inserting a new one
  ([lib/db/participants.ts#renameAnonymousParticipant](lib/db/participants.ts),
  [app/api/sessions/[id]/join/route.ts](app/api/sessions/%5Bid%5D/join/route.ts)).
  `WaitingClient` sends its stored `participantId` with the join request
  when one exists
  ([app/session/[id]/waiting/WaitingClient.tsx](app/session/%5Bid%5D/waiting/WaitingClient.tsx)).
  A genuine first-time joiner (fresh browser, no stored identity) is
  unaffected — still gets a fresh row exactly as before.

  Re-verified live after the fix: same 2-browser-context repro now shows
  exactly 2 participant rows (`Alex`, `Sam`), and canvas pixel sampling
  confirms a clean 2-column side-by-side split (both columns populated, a
  thin film-black gutter between them, no unused grid cells). Full test
  suite (229 tests), `tsc --noEmit`, and `eslint` all pass.

## 🟡 Worth a look

- [x] **Clerk dev-key warning: "infinite redirect loop."** — **Verified
  2026-08-06, not a real mismatch.** Queried the Clerk backend API with
  `CLERK_SECRET_KEY` (`GET https://api.clerk.com/v1/instance`) and the
  publishable key's own frontend API domain
  (`GET https://<subdomain>.clerk.accounts.dev/v1/environment`); both
  resolve to the same instance (shared ID segment between
  `ins_3HK0oF…` and `aac_3HK0oF…`). `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
  `CLERK_SECRET_KEY` in `.env.local` are a matched pair — the warning is a
  known dev-instance artifact, not a real key mismatch. No code change.

## ✅ Verified working

- [x] Landing page renders correctly, CTA (`Enter the booth →`) navigates to `/session/new`.
- [x] Mode select → "Shoot solo" creates a session and routes to `/capture`.
- [x] Camera permission → synced countdown → 4-shot burst → auto-advance to `/preview` (no errors, no hangs).
- [x] Preview → Style → Generate step-through and back-buttons all wire up correctly.
- [x] Style presets (B&W / Sepia / Vintage / High-contrast) visibly change the live canvas preview.
- [x] "Continue with 3 →" (skip login) correctly bypasses the Clerk sign-in gate and generates a 3-photo strip.
- [x] "Developing" reveal animation → upload → redirect to `/output` completes without error.
- [x] Output page: **Download** produces a real file (`strip-snap-<id>.png`) via a real click-triggered download.
- [x] Output page: **Share** falls back correctly to clipboard-copy in a browser without the Web Share API ("Link copied to clipboard.").
- [x] **Add/Hide stickers** toggle works.
- [x] Public `/strip/:id` page loads standalone (no auth, no session context) and shows the same strip + action buttons.
- [x] No uncaught console errors or failed requests anywhere in the flow (aside from benign aborted Next.js RSC prefetches).

## Follow-up pass — 2026-08-07

Covered everything the first pass listed as "not covered," via two headless
Chromium browser contexts (fake camera device) for the multiplayer path and
an iPhone 13 viewport emulation for the mobile pass.

- [x] **"Invite others" multiplayer path.** Found and fixed a real bug (see
  🔴 above). Aside from that, the rest of the path works: waiting room
  invite-link + presence sync (both participants see each other's
  `Connected`/`Ready` status live), synced countdown election, both
  browsers auto-advance `/waiting` → `/capture` → `/preview` together, zero
  console errors on either side.
- [x] **4-photo unlock flow — structural check only** (no real Clerk test
  account was provided, per this pass's scope decision). Clicking "Sign in
  to unlock 4" correctly opens Clerk's real sign-in modal (email + Google
  OAuth, dev-mode badge shown). `POST /upgrade` called unauthenticated
  correctly returns `401`, which `GenerateClient` already has explicit
  handling for. Completing an actual sign-in and confirming the 4-photo
  unlock end-to-end is still untested.
- [x] **Retake-a-shot flow on `/preview`.** Clicking "Retake" on a shot runs
  the local 3-2-1 countdown, captures a fresh frame, and replaces only that
  shot — verified programmatically (the retaken shot's data changed, the
  other 3 were byte-identical before/after) and visually. Continuing to
  `/style` afterward works with no errors.
- [x] **Print stylesheet.** Emulated `print` media on `/output`: the strip
  image renders full-size and unobstructed; the "Ready" heading and all
  action buttons (Add stickers / Download / Share / Print / Start over) are
  correctly hidden via `print:hidden`.
- [x] **Mobile viewport / responsive layout.** Drove the full solo flow
  (landing → mode select → capture → preview → style → generate → output)
  at an iPhone 13 viewport (390×844). No horizontal overflow on any screen,
  no console errors, all text/buttons readable and correctly stacked. One
  non-issue worth noting: Clerk's dev-mode "Your app is ready" nag toast
  (local dev-key artifact — see the Clerk finding above, never renders in
  production) is `position: fixed` and, on a viewport this narrow, can
  visually overlap page content — cosmetic only, not an app bug, and
  dismissable.
