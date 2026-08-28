# Handover

Written 2026-08-28 during a machine change: the previous laptop's DLP agent
blocks `.jar` downloads from `dl.google.com` and Maven, so the Android SDK
cannot be installed there and the project cannot be built on it. Development
continues on a different machine. This file is the state of record for
picking the work back up.

## Current state

An N-Body gravity sandbox (Next.js + TypeScript canvas simulation) is being
converted into a distributable Android app via Capacitor, phase by phase,
each phase verified before the next began.

**Complete and verified:**

- **Phase 0** — audit of the existing codebase.
- **Phase 1** — static export (`output: 'export'` in `next.config.ts`).
- **Phase 2** — Capacitor shell scaffolded (`android/` added, manifest/theme
  configured to avoid a white launch flash). Code-complete but **never
  verified on real hardware or even the Android SDK** — no SDK has been
  installed on any machine used for this project yet. Treat Phase 2 as
  unverified until it's actually built and run once.
- **Phase 3a / 3a-2** — camera math extracted to `src/lib/camera.ts`,
  pixel-identical to the pre-refactor rendering (verified via canvas
  hashing). Presets converted from canvas-relative to fixed world units,
  trajectory-identity proven against the old behavior.
- **Phase 3b-1 through 3b-4** — pointer/gesture unification: mouse, pen, and
  touch on one explicit state machine (`src/lib/gestures.ts`), on-screen
  controls (mode toggle, pause/rewind), Follow/Unfollow, full coverage
  matrix (every keyboard/mouse-only interaction has a touch equivalent).
- **Phase 4 / 4b / 4c / 4d** — safe-area insets, rotation-preserving camera,
  control layer restructured into a single-row bar + sheets (the original
  design consumed up to 67% of phone-landscape screen height — a ship
  blocker, not polish), Escape/back precedence unified, double-click no
  longer leaves the editor open when it engages follow.

All of the above is verified **in a desktop/synthetic-touch browser only**
(Playwright, including CDP-driven synthetic multi-touch). None of it has
been confirmed on a real Android device or even a real Android emulator.
Synthetic touch is explicitly weaker evidence than hardware — timing, palm
rejection, and OS-level gesture interception are untested.

## Exact next step: Phase 5

Barnes-Hut spatial partitioning vs. the current brute-force O(n²) physics
integrator. **This has not been started or even scoped.** It's flagged as a
potential conflict with the standing rule not to refactor the physics
model/integrator without an explicit proposal — so before writing any
Barnes-Hut code, propose a concrete threshold: exact pairwise below some N,
Barnes-Hut above it, with N *measured* on real hardware, not assumed, and
the same seeded initial condition shown running correctly under both paths.
This requires an actual device to get meaningful frame-time numbers — do
not build this on desktop-only performance numbers.

**Phase 6** (device verification checklist) comes after Phase 5 and also
needs hardware.

## Setup on a fresh machine

- **Node**: no `.nvmrc` or `engines` field is pinned in `package.json`; this
  project was developed against Node v24.19.0. Anything reasonably recent
  should work, but match that if you hit odd build behavior.
- `npm install`
- **Android Studio**, with:
  - **SDK Platform 36 only** — do not install Platform 37. `targetSdk` and
    `compileSdk` are both pinned to 36 in `android/variables.gradle`;
    installing 37 risks the IDE defaulting new-project tooling to it and
    drifting from what's actually configured here.
  - **Build-Tools** (matching API 36)
  - **Platform-Tools** (for `adb`)
  - `minSdk` is 24 — no need to install anything below that.

## The build loop

```
npm run build       # static export -> out/
npx cap sync         # copies out/ into android/app/src/main/assets/public, syncs plugins
```

Then open `android/` in Android Studio and run from there (or `npx cap run
android` if you prefer the CLI). Re-run both `npm run build` and `npx cap
sync` after any change to app code before rebuilding in Android Studio —
Capacitor doesn't watch `out/` for you.

## Known state — read before touching Android config

- **`appId` is `com.jordanfaroz.nbody`** — this is baked into the generated
  Android project (namespace, `applicationId`, `strings.xml` in two places,
  and the Java package directory structure). Changing it after the fact
  previously required deleting and regenerating the entire `android/`
  directory, which meant manually re-applying three hand-edited native
  files from scratch. Treat the appId as permanent unless you're prepared
  to redo that.
- **`targetSdk` / `compileSdk` = 36**, `minSdk` = 24. Confirmed directly
  from `android/variables.gradle` — don't take this file's word for it if
  it drifts; re-check the actual gradle file.
- **`android/` is committed to git.** Do **not** run `npx cap add android`
  on a fresh clone — that regenerates the directory from scratch and will
  discard three manually-edited native files that aren't reproducible by
  the generator: `AndroidManifest.xml`, `values/colors.xml`, and
  `values/styles.xml` (these exist to prevent a white launch-flash flicker,
  among other things — Capacitor's default `splash.png` is pure white).
  `android/` already exists in the clone; just `npm install`, build, sync,
  and open it in Android Studio.
- No keystore, signing config, or `local.properties` is committed (correctly
  — `local.properties` holds a machine-specific SDK path and is gitignored
  by Capacitor's own nested `android/.gitignore`). You'll need to let
  Android Studio generate `local.properties` itself on first open.

## Two durable rules

Recorded because both are the kind of thing that looks like unnecessary
complexity to someone who wasn't there for the bug, and gets "cleaned up"
by a future pass that reintroduces it.

1. **The `setPointerCapture` try/catch.** Every call site wraps
   `setPointerCapture` in try/catch. If the pointer was already released
   between the event firing and the handler running, `setPointerCapture`
   throws `NotFoundError` — found via a synthetic-pointer Playwright test,
   evidence preserved in `verification/dbg-capture.mjs`. Do not simplify
   this away; it will reintroduce an uncaught exception under real,
   reproducible timing conditions, not a theoretical edge case.

2. **The paired-negative-assertion rule.** Any test that asserts "action X
   is blocked here" is worthless on its own — pair it with an "X still
   works there" test, or a feature that's broken *everywhere* can pass a
   test suite by looking like a correctly-scoped restriction. This was
   learned the hard way: the canvas had no CSS size early in the gesture
   work, which meant `document.elementFromPoint` never returned the canvas
   at all, and every "spawning is blocked over control X" test passed for
   entirely the wrong reason — spawning was broken everywhere, not
   correctly scoped. Only a paired positive check ("open canvas still
   spawns") caught it. Every harness in `verification/` that asserts a
   blocked interaction pairs it with a positive check nearby — keep that
   pattern when adding new ones.

A third informal rule worth carrying forward even though it isn't backed by
its own memory file: read the actual code before writing a test against it.
A duplicate Escape-key listener was found this way, before a test would
have been written against the wrong assumption about ownership.

## Where the verification harnesses live

`verification/` at the repo root — 16 scripts plus a README covering, per
script: which phase it proves, what invariant it asserts, and the exact
command to run it. Also documents the "pause before loading a preset" and
"validate the baseline against itself" discipline that isn't obvious from
reading the scripts alone. Start there — `verification/README.md` — before
running any of them.
