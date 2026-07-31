# MVP Scope — Online Photobooth

Status: Draft v1 — derived from PRD v1, TRD v1, and the backend schema doc.

## 1. Hypothesis

People across three segments — solo social-media users, friend groups, and LDR partners — will use a synced, multi-shot online photobooth enough to justify building past MVP. This release exists to test that, not to generate revenue or reach feature-completeness.

**Validated if:** 100 unique sessions in the first 30 days post-launch, with 20%+ of users creating more than one strip.
**Invalidated if:** sessions don't materialize, or they start but drop off heavily before strip completion — which is why session-start → strip-completed conversion is tracked as its own metric, separate from the raw session count (per PRD §Success metrics).

## 2. Target audience for this release

All three PRD personas (solo, friend group, LDR partner) are in scope equally — none is deprioritized for MVP. This is a deliberate PRD decision, not an oversight: the LDR use case is the sharpest differentiator, but solo/friend-group usage is what gets the volume needed to hit the 100-session benchmark.

## 3. In scope

Everything here maps to a PRD functional requirement or a TRD implementation-order item; nothing is added that isn't traceable to one of those two documents.

**Core flow**

- Landing page pitching all three use cases, single "start a session" CTA
- Mode selection: solo vs. invite
- Invite flow: shareable link + waiting room with live presence
- Synced countdown (server-timestamp scheduling, sub-second drift target) + simultaneous capture across connected participants
- Preview & retake individual shots before finalizing
- Style/filter preset picker (small fixed set, not user-uploadable filters)
- Strip generation: client-side Canvas compositing, 3-photo (no login) or 4-photo (login required)
- Output: download as image, native share, print-ready export (browser print or downloadable print-ready file — not a mail-out fulfillment service, per PRD assumption)

**Auth**

- Clerk email/password + Google login
- Login gate applies only to the 4-photo format upgrade — no login required anywhere else in the flow

**Infrastructure**

- Full backend schema per `online-photobooth-backend-schema.md`, including RLS, rate limiting, and 24h session TTL/cleanup
- Basic analytics: `session_started`, `strip_completed` events, plus the `daily_metrics` rollup

**Responsive support**

- Desktop and mobile web, responsive layout (no native app) — mobile-first on the capture/console screens specifically, per the design brief

## 4. Out of scope for this release

Explicitly deferred, with the reason each is excluded:

| Item                                                           | Why it's out                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Paid tier / monetization                                       | PRD states this is a usage-validation release, not a revenue release; revisit only once usage data validates demand   |
| Mail-out print fulfillment                                     | Requires a separate printing/shipping vendor integration; PRD scopes "print" as self-print only for MVP               |
| Requiring every participant to be logged in for 4-photo unlock | PRD/TRD `[ASSUMPTION]` currently models one-logged-in-participant-unlocks-for-all; open question, not committed scope |
| Blocking capture until a dropped participant reconnects        | TRD `[ASSUMPTION]` currently models proceeding with remaining ready participants; open question, not committed scope  |
| Native mobile app                                              | PRD explicitly scopes browser-only, responsive web for MVP                                                            |
| User-uploadable/custom filters                                 | Only a small fixed preset set is in scope; a filter marketplace or upload path is a future consideration              |
| Account settings / profile management beyond Clerk defaults    | Not mentioned anywhere in PRD; Clerk's built-in flows are sufficient for MVP                                          |
| Session history / "my strips" library page                     | Not in PRD functional requirements; strips are reachable via share link or download, not a persistent gallery         |
| Read replicas / horizontal scaling infra                       | Backend schema doc flags these as future levers, explicitly not needed at MVP volume                                  |

## 5. Constraints

- **Hosting/infra must stay within free-tier limits** (Vercel, Supabase, Clerk) — this shapes the realtime connection cap risk flagged in the TRD and rules out any infra spend for MVP.
- **No fixed launch deadline** — scope discipline (§4) matters more than speed here, since there's no external date forcing tradeoffs.
- **Countdown sync must hit sub-second drift** — this is a hard non-functional requirement, not a nice-to-have, since a visibly unsynced countdown breaks the core differentiator (feeling "together" for the LDR persona).
- **Client-side photo processing** — raw shots never leave the browser; only the composited strip is uploaded. This is a privacy requirement from the PRD, not just an architecture preference, and constrains any future feature (e.g., server-side filters) that would need raw frames.

## 6. Definition of done for MVP launch

- [ ] All functional requirements in PRD §"Functional requirements" (items 1–11) implemented and working end-to-end for all three personas
- [ ] Backend schema deployed with RLS enabled on every table (§4 of the schema doc) and zero permissive policies beyond the service role path
- [ ] Countdown drift verified sub-second across at least a 3-participant session on differing network conditions
- [ ] Camera-denied and unsupported-browser fallback states implemented (TRD §8 risk)
- [ ] Session expiry/cleanup job running and verified to cascade-delete participants, strips, and their Storage objects
- [ ] Analytics events firing correctly for `session_started` and `strip_completed`, feeding `daily_metrics`
- [ ] Responsive pass complete on mobile web for the full flow, capture screens full-bleed per design brief
- [ ] The two open `[ASSUMPTION]` items (4-photo login scope, dropped-participant handling) resolved one way or the other before launch, not left ambiguous in production behavior

## 7. Open items to resolve before build starts

Same two items flagged in both the TRD and the schema doc — repeating them here since they're scope decisions, not just technical ones:

1. Does the 4-photo unlock require one logged-in participant (current assumption) or all participants logged in?
2. Does a mid-countdown participant drop proceed with an empty slot (current assumption) or block until reconnect?
