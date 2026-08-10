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

## Pass 3 — 2026-08-10 (full end-to-end QA + Classic Sketch redesign)

Driven with Playwright + Chromium (fake camera device) against a live local
Supabase, across three flows: solo at 1440×900, solo at 390×844 (iPhone-13
viewport), and a two-browser-context invite/multiplayer run. Every screen was
checked for console errors, failed requests, 5xx responses, and horizontal
overflow. Screenshots and driver scripts are in the session scratchpad.

**Result: 229/229 tests, `tsc --noEmit` clean, `eslint` clean, `next build`
succeeds, all three browser flows clean.**

### 🔴 Real bugs found and fixed

- [x] **The primary CTA never actually rendered as a primary CTA.** Three
  screens passed `className="border-forest bg-forest text-cream"` to
  `<Button variant="default">` to get the one filled CTA the design brief
  allows per screen. That silently does nothing: **Tailwind resolves
  conflicting utilities by stylesheet order, not by the order classes appear
  in the attribute**, so the variant's own `bg-transparent` / `text-ink` /
  `border-ink` win. Confirmed by reading computed styles in the browser —
  `background-color: rgba(0, 0, 0, 0)` where forest `rgb(51, 66, 46)` was
  intended. Affected `/style` ("Continue to generate"), `/preview`
  ("Continue to style"), and `/generate` (both "Unlock 4" call sites).
  Fixed by adding a real `variant="primary"` to
  [components/ui/Button.tsx](components/ui/Button.tsx) that composes the
  filled treatment instead of trying to override it, and switching all four
  call sites to it. The trap is documented in `DESIGN.md` so it does not get
  re-opened by patching colors through `className` again.

- [x] **Landing-page footer rendered as a full box instead of a top rule.**
  `border-t` (a *side* width utility) combined with `border-hairline` (an
  *all-sides* width utility) meant the all-sides value applied to all four
  edges. Nearly invisible at the old 1px, obvious at the sketch look's 2px.
  Fixed with the side-specific `border-t-booth-inner`. Swept the codebase for
  the same `border-{side}` + `border-booth*` collision — no others.

- [x] **React render errors above the root layout produced a blank white
  page, reported nowhere.** No `global-error.tsx` existed. Added
  [app/global-error.tsx](app/global-error.tsx) — captures to Sentry and
  renders a sketch-styled "The booth jammed" recovery screen with retry and
  back-to-start. It renders its own `<html>`/`<body>` (Next swaps it in
  *instead of* the root layout), so it deliberately uses literal colors
  rather than the next/font-dependent tokens, which are unavailable when the
  layout itself is what broke.

- [x] **App Router navigations were not instrumented in Sentry.** The SDK
  looks for an `onRouterTransitionStart` export on the client instrumentation
  file and warned about it on every dev startup; without it, a crash on
  `/session/:id/style` reports against whatever route the user first landed
  on. Added to [instrumentation-client.ts](instrumentation-client.ts),
  exported unconditionally — it is a no-op when the SDK was never initialised,
  which is the current empty-DSN state.

- [x] **`prefers-reduced-motion` did not cover the booth's 3D pose swing** —
  a full 1s perspective rotation of the entire shell, by far the largest
  movement on the site. `globals.css` only silenced `animate-fade-up`.
  Suppressed via a `.booth-pose` class on
  [components/booth3d/BoothFrame.tsx](components/booth3d/BoothFrame.tsx); the
  class, rather than the inline `transform`, is the target because a media
  query cannot override an inline style.

- [x] **`StripPreview` could only be bounded on width.** A composited strip is
  roughly 1:3.7, so inside a card it rendered ~1300px tall and pushed the rest
  of the screen off the fold. Added an optional `className` on the film-black
  frame plus `max-h` / `w-auto` on the canvas, so it scales against whichever
  axis is tighter. Width-bound behaviour is unchanged when no caller opts in.

- [x] **The landing page depended on `picsum.photos`** for its hero imagery —
  a third-party network request on the front door, showing stock photos under
  a caption that implied user output. Replaced with
  [components/booth3d/SketchFilmstrip.tsx](components/booth3d/SketchFilmstrip.tsx),
  a drawn empty filmstrip; empty frames are the honest illustration, since
  every strip does start blank. The orphaned `images.remotePatterns` entry was
  dropped from [next.config.mjs](next.config.mjs).

- [x] **Documentation contradicted the code.** `DESIGN.md` still described the
  old warm-editorial palette (`cream #e6e8f7`, Playfair Display, "no drop
  shadows anywhere") as the source of truth — the opposite of what shipped.
  Rewritten. Stale comments describing the deleted three-theme system
  (classic / neon / kawaii) were removed from `Button`, `Card`, `Photostrip`,
  and `tailwind.config.ts`, and the dead `card` / `card-lg` / `hairline`
  tokens deleted now that nothing references them.

### 🟡 Environment gotchas (not code bugs — recorded so the next pass does not chase them)

- **Docker Desktop not running** means 67 of 229 tests fail with
  `TypeError: fetch failed`. Nothing is verifiable until `supabase start`.
- **The Storage container takes ~7 minutes to become healthy on a cold
  start**, stuck in `[Migrations] Running vector_store migrations` with port
  5000 refusing connections. Until then, 8 storage-dependent tests fail with
  "An invalid response was received from the upstream server". **Wait it out —
  do not restart the container**; it recovers on its own and all 8 pass.
- **Realtime channel subscribe can report `TIMED_OUT` in the browser while the
  dev server is cold-compiling a route** (the join push has a ~10s timeout).
  Not an app bug: a Node probe that mints a real token via `POST /api/sessions`
  and joins the private channel directly returns `SUBSCRIBED`, with a correct
  `topic` claim and sane `iat`/`exp`. Once routes are warm the invite flow
  passes cleanly. Container clocks were checked against the host and are in
  sync.
- **One transient `ERR_TOO_MANY_REDIRECTS` on `/session/new`** in a cold
  browser context (Clerk dev-instance handshake). `curl` gets a plain 200 with
  zero redirects and it cleared on retry — consistent with the known dev-key
  artifact recorded in the 2026-08-06 pass.

### ✅ Verified working this pass

- [x] Solo, desktop 1440×900 — 14 screens end to end, **0** console errors,
  **0** failed requests, **0** horizontal overflow, `participantCount = 1`.
- [x] Solo, mobile 390×844 — same flow, same clean result, no overflow on any
  screen.
- [x] Invite / multiplayer, two browser contexts — presence sync (the host
  sees the guest join live), both clients advance `/waiting` → `/capture` →
  `/preview` together off one synced countdown, `participantCount = 2`.
- [x] **Group collage geometry pixel-verified**, not eyeballed: the canvas is
  408×1520 with 3 slots, and sampling the midpoint of each half-width
  sub-region shows both halves filled with *distinct* content in every slot.
  This is the direct regression guard for the two duplicate-participant bugs
  in the passes above, which rendered part-black grids.
- [x] Retake flow — the live camera now takes over the booth's centre screen
  (`ScreenConsole`), the countdown runs, and only that frame is replaced.
- [x] Style presets visibly change the live canvas preview (F-19).
- [x] Print media emulation on `/output` — controls hidden, strip full-size.
- [x] Sticker toggle on `/output`.
- [x] Public `/strip/:id` share view loads standalone.
- [x] `next build` succeeds; `/` still prerenders as static content despite the
  booth shell being a client component.

### Design: the booth is now the whole site

Every screen except two deliberate exceptions is built on `BoothFrame` —
landing, mode select, waiting, capture, preview, style, and the developing
reveal. `/output` and `/strip/:id` keep the shell off on purpose so the
finished strip gets the most whitespace on the site (design brief §3's
"signature moment"), carrying the look through `Photostrip`'s own chrome.
Display type moved to Architects Daughter; the 29 `font-display italic`
usages were stripped, since that face has no italic and the browser was
synthesizing a skewed oblique.

### Not addressed

- `app/fonts/GeistVF.woff` and `GeistMonoVF.woff` (~134KB) are
  create-next-app leftovers referenced by nothing. Left in place — deleting
  files was outside this pass's scope.
- The 4-photo unlock still has not been exercised with a real signed-in Clerk
  account (no test account provided); the structural path is unchanged from
  the 2026-08-07 pass.
