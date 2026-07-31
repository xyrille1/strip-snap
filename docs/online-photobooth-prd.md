# Online photobooth — product requirements document

## Introduction / overview

A web-based photobooth that lets people create retro-style, multi-shot photo strips without visiting a mall booth. It serves three use cases from one shared underlying flow: solo users making strips for social media, friend groups running a shared virtual session, and long-distance partners who want to feel like they took a photo together despite being apart. The core differentiator versus a phone filter app is the multi-shot strip format combined with a synced, shared countdown across participants in different locations.

## Goals / objectives

- Primary goal for MVP: validate that people will actually use the product — this is a usage-validation release, not a revenue release.
- Success benchmark: 100 unique sessions within the first 30 days of launch, with 20%+ of users creating more than one strip (repeat usage).
- Secondary goal: measure the drop-off between session start and strip completion, to distinguish "the flow is broken" from "people aren't interested."

## Target audience / user personas

1. **Solo user** — wants a fast, low-friction retro strip for social media.
2. **Friend group** — wants a shared virtual session with multiple remote participants.
3. **LDR partner** — wants to feel physically together with their partner via a synced strip despite the distance. This is the sharpest differentiator versus generic filter apps.

The MVP targets all three personas equally rather than prioritizing one.

## User stories / use cases

- As a solo user, I want to start a session without logging in, so I can quickly get a 3-photo strip.
- As a user who wants more photos, I want to log in to unlock the 4-photo strip.
- As a user in an LDR, I want to invite my partner via a shareable link so we can join the same synced session from different locations.
- As a session participant, I want a shared countdown so everyone in the session captures their shots at the same moment.
- As a user, I want to preview my shots and retake individual ones before finalizing the strip.
- As a user, I want to choose a retro filter/style before the final strip is generated.
- As a user, I want to download, share, or print my finished strip.

## Functional requirements

1. Landing page communicating all three use cases, with a primary "start a session" call to action.
2. Mode selection: solo vs. invite partner(s).
3. Invite flow: generate a shareable session link; waiting-room state showing live connection status as others join.
4. Synced capture: a shared, real-time countdown that triggers simultaneous capture across all connected cameras.
5. Strip format choice: 3-photo strip (no login required) or 4-photo strip (requires login).
6. Authentication: email/password and Google/social login, implemented via Clerk.
7. Preview & retake: review captured shots and retake individual shots before finalizing.
8. Style/filter selection: choose from a small set of retro presets before the strip is composited.
9. Strip generation: composite the selected shots into the chosen format and style.
10. Output: download the strip as an image, share it (link or native share), and print it.
11. Basic usage analytics: track sessions started, strips completed, and repeat usage per user.

## Non-functional requirements

- Runs in-browser on desktop and mobile web (responsive); no native app for MVP.
- Real-time sync should feel simultaneous — target sub-second countdown drift between participants.
- Hosting/infrastructure must stay within free-tier service limits for MVP.
- Privacy: process captured photos client-side where possible; stored strips should only be reachable via an unguessable share link or the owning account.

## Design considerations / mockups

- Landing page, solo capture setup screen, and the synced multi-participant capture screen have already been mocked up.
- Visual direction: flat, retro aesthetic (film grain, warm tones) — reinforcing photobooth nostalgia rather than reading as a generic camera app.

## Success metrics

- 100 unique sessions within the first 30 days of launch.
- 20%+ of users create more than one strip.
- Session-start → strip-completed conversion rate, tracked separately to catch flow friction.

## Open questions / future considerations

- **[ASSUMPTION — needs validation]** For a shared LDR/friend session, only one participant needs to be logged in to unlock the 4-photo strip for the whole session. Confirm if this should instead require every participant to be logged in.
- **[ASSUMPTION — needs validation]** "Print" scope is a print-ready export the user prints themselves (e.g., via browser print or a downloadable print-ready file), not a mail-out fulfillment service. Mail-out would require a separate printing/shipping vendor integration and should be scoped as a distinct feature if wanted.
- Paid tier is explicitly out of scope for MVP; revisit once usage data validates demand.
- Tech stack and system architecture are intentionally not covered here — that's the next step, a Technical Design Document.
