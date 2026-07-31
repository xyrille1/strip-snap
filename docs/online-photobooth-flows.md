# Online Photobooth — App Flow & User Journey

## 1. App flow

### 1a. Entering a session

```
Landing page
"Start a session"
      │
      ▼
Choose mode
"Solo or invite partners"
      │
      ├──────────────┐
      ▼              ▼
    Solo         Invite partner(s)
"Skip straight   "Share link +
 to capture"      waiting room"
      │              │
      └──────┬───────┘
             ▼
  Synced countdown & capture
  "Shared countdown, webcam capture"
```

### 1b. Capture to output

```
Preview & retake
"Review shots, retake any"
      │
      ▼
Choose style
"Pick a retro preset"
      │
      ▼
Generate strip
"3-photo free, 4-photo needs login"
      │
      ▼
Get your strip
"Download, share, or print"
```

## 2. User journey — LDR partner

The sharpest differentiator persona. Stages reflect goal/feeling at each point, not just screens.

```
Trigger
"Miss taking photos together"
      │
      ▼
Discover & invite
"Sends partner the link"
      │
      ▼
Wait & connect
"Waiting room shows partner join"
      │
      ▼
Shared moment
"Countdown makes it feel shared"
      │
      ▼
Keep the memory
"Downloads, shares, or prints it"
```

**Persona variants:**

- **Solo** — same shape, skips "wait & connect": trigger → invite (self only) → shared moment → keep the memory.
- **Friend group** — same shape as LDR, but "wait & connect" shows multiple participants joining the waiting room instead of one.

## 3. Login gate note

The 4-photo format upgrade (per PRD `[ASSUMPTION]`) triggers at "generate strip" in the app flow — one logged-in participant unlocks it for the whole session.
