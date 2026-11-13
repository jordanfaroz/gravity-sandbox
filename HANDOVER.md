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
   diverge the way a real phone's address bar does by resizing the viewport
   alone. `npm run lint` / `tsc --noEmit` / `npm run build` all passing and
   `verification/toolbar-visibility-verify.mjs` passing prove the layout is
   internally consistent at every tested size, not that the vh→dvh swap
   itself does anything visible to this tooling — the same caveat
   `phase4-verify.mjs` already carries for `env(safe-area-inset-*)`
   resolving to 0 in desktop Chromium. **This dvh/vh CSS layer alone did not
   fix the bug on a real device** — see item 4 below for what replaced it as
   the primary fix, and for how that part IS covered by a genuinely
   discriminating headless test.

4. **The visualViewport JS fallback, and why its test mocks the object
   instead of resizing the viewport.** After item 3's CSS-only fix still
   failed on a real device, the app shell (`gravity-sandbox.tsx`'s root div)
   was changed to read `window.visualViewport.height`/`.offsetTop` directly
   (`src/lib/use-visual-viewport.ts`, updated on both the `resize` and
   `scroll` events `visualViewport` fires) and override the CSS sizing with
   `position: fixed` + an explicit height once a real measurement lands. A
   second, independent fallback was added alongside it: a top-anchored
   "Planets / Presets" button (`data-control="planets-presets-handle"`,
   next to Help/Fullscreen) that's reachable by construction regardless of
   either sizing fix, because `top: safe-area-inset-top` can't end up below
   the fold the way a `bottom: 0` element can.

   Per item 3, resizing a Playwright viewport can't make
   `window.visualViewport` diverge from the layout viewport in headless
   Chromium — but this fix *reads that JS object directly*, which means it
   CAN be exercised in headless Chromium by replacing the object itself.
   `toolbar-visibility-verify.mjs`'s `mockVisualViewport` does this: before
   the page's own JS runs (`page.addInitScript`), it swaps
   `window.visualViewport` for a fake with a shorter `height` and nonzero
   `offsetTop` than the real layout viewport, forwarding every other
   property from the real object so nothing unrelated breaks. Because the
   fix reads this object and the old (pre-this-fix) code never did, the
   check genuinely discriminates — confirmed by running it against the
   pre-fix build directly (`git stash`, rebuild, run the test against that
   build) and watching it fail with the toolbar's real bottom edge past the
   mocked visible area, then pass again once the fix is restored. Do not
   "simplify" this test back to plain `setViewportSize` matrix testing like
   `testOrientation`'s — that's exactly the form that passed on both the
   broken and fixed code and is why this layer needed a different test at
   all.

   Do not size the canvas itself from this new shell-height mechanism, or
   from `visualViewport` at all — that would violate the coordinate-space
   boundary documented on `sizeCanvas` in `gravity-sandbox.tsx` (still
   layout-viewport-only, unchanged). The two are different concerns:
   `sizeCanvas` owns the canvas's backing store and pointer-coordinate math;
   this fallback owns only the outer shell container's CSS box, which the
   canvas then fills via `inset: 0` exactly as before.

## Where the verification harnesses live

`verification/` at the repo root — scripts plus a README covering, per
script: what invariant it asserts and the exact command to run it. Also
documents the "pause before loading a preset" and "validate the baseline
against itself" discipline that isn't obvious from reading the scripts
alone. Start there — `verification/README.md` — before running any of them.
