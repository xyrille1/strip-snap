# Test Plan — Online Photobooth

Status: Draft v1 — covers the scope defined in `online-photobooth-mvp-scope.md` §3. Test IDs are referenced by area so failures can be traced back to a PRD/TRD requirement.

## 1. Scope

Covered: every flow in MVP scope §3 (landing → mode select → invite/waiting room → countdown → capture → preview/retake → style → strip generation incl. login gate → output), plus the security and non-functional requirements underpinning them.
Not covered: anything in MVP scope §4 (out of scope) — no test cases are written against paid tier, mail-out print, native app, or session history, since none of it ships.

## 2. Test environments & matrix

| Browser          | Desktop | Mobile                                                      |
| ---------------- | ------- | ----------------------------------------------------------- |
| Chrome (latest)  | ✅      | ✅ (Android)                                                |
| Safari (latest)  | ✅      | ✅ (iOS — camera permission model differs, test explicitly) |
| Firefox (latest) | ✅      | —                                                           |
| Edge (latest)    | ✅      | —                                                           |

Network conditions to test countdown sync under: same-network (baseline), throttled 3G (one participant), and asymmetric (one participant fast, one slow) — this last one is the actual LDR use case and the highest-value test.

## 3. Functional test cases

### 3.1 Landing & mode selection

| ID   | Case                    | Expected result                                                            |
| ---- | ----------------------- | -------------------------------------------------------------------------- |
| F-01 | Load landing page       | All three persona pitches visible; single "start a session" CTA present    |
| F-02 | Click "start a session" | Navigates to mode selection                                                |
| F-03 | Select "Solo"           | Skips invite/waiting room, proceeds straight to capture (per app flow §1a) |
| F-04 | Select "Invite"         | Generates shareable session link, navigates to waiting room                |

### 3.2 Invite & waiting room

| ID   | Case                                         | Expected result                                                                    |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| F-05 | Copy/share invite link                       | Link is a valid, unguessable UUIDv4-based session URL                              |
| F-06 | Second participant opens link                | Added to `participants`, appears in host's waiting room presence list in real time |
| F-07 | Third+ participant joins (friend-group case) | All participants see each other in the presence list, not just host↔one-guest      |
| F-08 | Participant marks "ready"                    | Status reflected live to all other participants                                    |
| F-09 | All participants ready                       | Countdown auto-starts (or host-triggered, per final UX decision)                   |

### 3.3 Synced countdown & capture

| ID   | Case                                                       | Expected result                                                                                                                                                                     |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-10 | Countdown starts for a 2-participant session, same network | Both clients capture within sub-second drift of each other (TRD non-functional target)                                                                                              |
| F-11 | Countdown starts under asymmetric network conditions (§2)  | Drift still sub-second — validates server-timestamp scheduling (TRD §3), not receipt-time triggering                                                                                |
| F-12 | Camera permission denied on one client                     | That client sees explicit fallback message; does not silently fail or hang the session for others (TRD §8 risk)                                                                     |
| F-13 | Unsupported browser (no `getUserMedia`)                    | Blocked at capture entry with explicit message, not a broken capture screen                                                                                                         |
| F-14 | Participant drops mid-countdown                            | Session proceeds with remaining ready participants; dropped participant's strip slot shown empty — confirm this matches whichever resolution was chosen for the open `[ASSUMPTION]` |

### 3.4 Preview, retake, and style

| ID   | Case                                     | Expected result                                                     |
| ---- | ---------------------------------------- | ------------------------------------------------------------------- |
| F-15 | Review captured shots                    | All shots for the session display correctly per participant         |
| F-16 | Retake a single shot                     | Only the retaken shot changes; others unaffected                    |
| F-17 | Retake repeatedly                        | No limit-related bug; each retake correctly replaces the prior shot |
| F-18 | Select a style preset                    | Preview reflects the chosen preset before final generation          |
| F-19 | Switch between presets before confirming | Preview updates each time, no stale preset applied to final strip   |

### 3.5 Strip generation & login gate

| ID   | Case                                                   | Expected result                                                                                                                                                        |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-20 | Generate 3-photo strip, no login                       | Succeeds without any auth prompt                                                                                                                                       |
| F-21 | Attempt 4-photo format, not logged in                  | Login prompt (Clerk) shown; format not unlocked until authenticated                                                                                                    |
| F-22 | Log in via email/password mid-flow                     | Session resumes at the same point, 4-photo format now available                                                                                                        |
| F-23 | Log in via Google                                      | Same as F-22, alternate auth provider                                                                                                                                  |
| F-24 | One participant logs in, others don't (shared session) | Per resolved `[ASSUMPTION]`: confirm whether format unlocks for the whole session or only the logged-in participant, and that behavior matches the documented decision |
| F-25 | Strip compositing                                      | Final image correctly reflects selected shots + style + format (3 vs. 4 photos)                                                                                        |

### 3.6 Output

| ID   | Case                              | Expected result                                                                                                    |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| F-26 | Download strip                    | Valid image file downloads, matches on-screen preview                                                              |
| F-27 | Share via native share sheet      | Correct link/image handed to OS share sheet on supported devices                                                   |
| F-28 | Share link opened by someone else | Recipient sees the finished strip without needing to log in or join the original session                           |
| F-29 | Print-ready export                | Produces a print-ready output (browser print or downloadable file, per PRD assumption) — not a mail-out order flow |

## 4. Security test cases

| ID   | Case                                                                     | Expected result                                                                                                      |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| S-01 | Attempt direct Supabase table read/write with the public anon key        | Denied — RLS deny-by-default confirmed on every table (schema doc §4)                                                |
| S-02 | Guess a session/strip ID by incrementing or brute-forcing                | Fails — UUIDv4, not sequential; no session/strip enumerable                                                          |
| S-03 | Access a strip's Storage URL after its signed-URL expiry window          | Denied; fetching `/api/strips/:id` again mints a fresh short-lived URL (schema doc §3.4)                             |
| S-04 | Call `/upgrade` (4-photo unlock) without a valid Clerk session           | Rejected server-side, not just hidden client-side                                                                    |
| S-05 | Submit oversized or malformed `display_name` / `style_preset` to the API | Rejected by request validation before reaching the database                                                          |
| S-06 | Rapid-fire session creation from one IP                                  | Rate limit engages per the threshold set in the schema doc §5                                                        |
| S-07 | Cross-origin request to an API route from a non-app domain               | Blocked by CORS policy                                                                                               |
| S-08 | Inspect client bundle for secrets                                        | No service role key, Clerk secret key, or other server-only credential present                                       |
| S-09 | Confirm raw (pre-composite) shots never leave the browser                | Network inspection shows no upload until final strip compositing; matches TRD/PRD client-side-processing requirement |

## 5. Data lifecycle test cases

| ID   | Case                                                      | Expected result                                                                                                                          |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Session left abandoned past `expires_at` (24h)            | Cleanup job marks it expired, then cascade-deletes participants/strips and the associated Storage objects (schema doc §7)                |
| D-02 | Account deletion via Clerk                                | `app_users` row soft-deleted; sessions/strips/analytics owned by other participants remain intact (FK `on delete set null`, not cascade) |
| D-03 | Delete a session mid-use (if a manual delete path exists) | Cascades correctly to participants and strips with no orphaned Storage files                                                             |

## 6. Non-functional / performance test cases

| ID   | Case                                                         | Expected result                                                                                                                                                             |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Countdown drift measurement across the network matrix (§2)   | Sub-second drift met on all tested conditions, including asymmetric network (TRD non-functional requirement)                                                                |
| P-02 | Realtime channel behavior near free-tier connection caps     | Documented as acceptable-at-MVP-volume risk (TRD §8); test at a simulated concurrent-session count near the 100-sessions/30-days target to confirm no premature degradation |
| P-03 | Strip compositing time (client-side Canvas)                  | Completes within a few seconds on a mid-range mobile device, not just high-end desktop                                                                                      |
| P-04 | Page load / Time to Interactive on mobile, throttled network | Landing and capture screens usable within a reasonable budget on 3G-equivalent throttling                                                                                   |

## 7. Accessibility test cases

Per the design brief §5:

| ID   | Case                                                                        | Expected result                                                                                                     |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A-01 | Contrast check: rust-on-cream and forest-on-cream at actual component sizes | Meets WCAG AA; confirms the design brief's flagged risk (large-type-only rust) holds once real components are built |
| A-02 | Illuminated buttons (select/record/pick-up) for color-blind users           | Each state has a non-color indicator (ring or icon change), not color alone                                         |
| A-03 | Keyboard navigation through the full flow                                   | All interactive elements (mode select, style picker, action row) reachable and operable without a mouse             |
| A-04 | Screen reader pass on key screens (landing, capture, output)                | Meaningful labels announced, not just visual-only cues (e.g., countdown number, presence list updates)              |

## 8. Responsive test cases

| ID   | Case                                        | Expected result                                                                                                                   |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Capture/console screens on mobile viewport  | Full-bleed layout; instruction strip collapses to single horizontal scroll row (design brief §5), not the 3-column desktop layout |
| R-02 | Output/share screen on mobile               | Strip still reads as the "hero moment" with generous whitespace, not cramped                                                      |
| R-03 | Waiting room presence list on small screens | Remains legible and usable with 3+ participants joined                                                                            |

## 9. Acceptance criteria (tied to PRD success metrics)

MVP is considered functionally ready to launch when:

- All Functional (§3) and Security (§4) test cases pass with no open Critical/High severity defects.
- Countdown drift (P-01) is confirmed sub-second across the full network matrix, since this is the core differentiator and a functional failure here undermines the product's premise.
- Session-start → strip-completed conversion tracking (D-flow analytics) is verified accurate before launch, since this is the metric the PRD uses to distinguish "flow is broken" from "people aren't interested" — an inaccurate funnel metric would make the MVP's own success signal unreliable.

## 10. Out of scope for this test plan

No test cases are written for: paid/billing flows, mail-out print fulfillment, native mobile app behavior, session history/library pages, or infra scaling beyond free-tier (read replicas, sharding) — all excluded per MVP scope §4, consistent with the "don't test what isn't shipping" principle.
