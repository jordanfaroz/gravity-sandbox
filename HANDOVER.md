# Handover

Updated 2026-10-14: the product is web-only now. An earlier plan to convert
this into a distributable Android app via Capacitor was dropped — the site is
good enough as a website. All of that work (phases 0 through 4d: static
export, Capacitor shell, camera/gesture unification, safe-area/rotation
handling, the single-row control bar) is preserved in git history on `master`
before the `web-first` branch; `android/`, `capacitor.config.ts`, and the
Capacitor npm packages were removed. The camera math, gesture state machine,
and touch controls it produced are still exactly what the website uses on
phones — only the native wrapper is gone.

## Current state

Deployed as a static Next.js export at https://nbody.jordworld.com (Vercel).
Touch, mouse, and pen all go through one gesture state machine
(`src/lib/gestures.ts`); the control bar/sheets, safe-area insets, and
rotation-preserving camera described below all still apply to any phone
opening the site in a browser.

**Two durable rules**, recorded because both are the kind of thing that looks
like unnecessary complexity to someone who wasn't there for the bug, and gets
"cleaned up" by a future pass that reintroduces it:

1. **The `setPointerCapture` try/catch.** Every call site wraps
   `setPointerCapture` in try/catch. If the pointer was already released
   between the event firing and the handler running, `setPointerCapture`
   throws `NotFoundError` — found via a synthetic-pointer Playwright test,
   evidence preserved in `verification/dbg-capture.mjs`. Do not simplify this
   away; it will reintroduce an uncaught exception under real, reproducible
   timing conditions, not a theoretical edge case.

2. **The paired-negative-assertion rule.** Any test that asserts "action X is
   blocked here" is worthless on its own — pair it with an "X still works
   there" test, or a feature that's broken *everywhere* can pass a test suite
   by looking like a correctly-scoped restriction. This was learned the hard
   way: the canvas had no CSS size early in the gesture work, which meant
   `document.elementFromPoint` never returned the canvas at all, and every
   "spawning is blocked over control X" test passed for entirely the wrong
   reason — spawning was broken everywhere, not correctly scoped. Only a
   paired positive check ("open canvas still spawns") caught it. Every
   harness in `verification/` that asserts a blocked interaction pairs it
   with a positive check nearby — keep that pattern when adding new ones.

A third informal rule worth carrying forward even though it isn't backed by
its own memory file: read the actual code before writing a test against it.
A duplicate Escape-key listener was found this way, before a test would have
been written against the wrong assumption about ownership.

## Where the verification harnesses live

`verification/` at the repo root — scripts plus a README covering, per
script: what invariant it asserts and the exact command to run it. Also
documents the "pause before loading a preset" and "validate the baseline
against itself" discipline that isn't obvious from reading the scripts
alone. Start there — `verification/README.md` — before running any of them.
