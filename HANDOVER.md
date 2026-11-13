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

3. **The dvh/vh fallback must be an `@supports` block, not a second
   declaration in the same rule.** `.app-shell-height` and `.sheet-max-height`
   in `globals.css` each declare `height`/`max-height` once in a plain rule
   (the `vh` value) and again inside `@supports (height: 100dvh)` (the `dvh`
   value) — not as two `height:` lines back to back in one rule, which reads
   like the more obvious way to write a fallback. It isn't: Next's production
   build minifies CSS with Lightning CSS, which treats two values for one
   property in one rule as plain redundancy and collapses them down to the
   *last* one, silently deleting the `vh` fallback from the shipped CSS.
   Confirmed by grepping the built output in `out/_next/static/chunks/*.css`
   — the two-declaration form really does ship as dvh-only. The `@supports`
   form survives, because collapsing across a feature query would change
   behaviour for browsers that don't match it. This is also why it's real
   CSS classes rather than a React inline `style` object: a plain JS object
   has one `height` key, not a cascade, so neither form works there at all.

   Related limitation, for whoever next touches this: headless/CDP-driven
   Chromium has no real browser chrome to show or hide, so
   `window.innerHeight`, `100vh`, and `100dvh` are always identical in
   Playwright — there is no way to make the layout and visual viewports
   diverge the way a real phone's address bar does. A pre-fix and post-fix
   screenshot of the mobile toolbar at any viewport size are byte-identical
   (checked with `png-diff.mjs`) for exactly this reason; `npm run lint` /
   `tsc --noEmit` / `npm run build` all passing and
   `verification/toolbar-visibility-verify.mjs` passing prove the layout is
   internally consistent at every tested size, not that the vh→dvh swap
   itself does anything visible to this tooling. That part needs an
   on-device recheck — the same caveat `phase4-verify.mjs` already carries
   for `env(safe-area-inset-*)` resolving to 0 in desktop Chromium.

## Where the verification harnesses live

`verification/` at the repo root — scripts plus a README covering, per
script: what invariant it asserts and the exact command to run it. Also
documents the "pause before loading a preset" and "validate the baseline
against itself" discipline that isn't obvious from reading the scripts
alone. Start there — `verification/README.md` — before running any of them.
