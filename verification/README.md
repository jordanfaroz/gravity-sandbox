# Verification harnesses

These are the Playwright/Node scripts that produced the "verified" claims in
every phase report for the Android conversion (see `HANDOVER.md`). They were
written to the OS temp scratchpad during development and are collected here
so they aren't stranded on a single machine.

They are evidence, not CI — nothing here runs automatically on commit or
push. Run them by hand when you touch camera math, gesture handling, or
control layout, and especially before believing a refactor changed nothing.

## Setup (once)

```
npm install
npm run build                              # static export -> out/
node verification/static-server.mjs out/ 4190   # leave running in its own terminal
```

Every browser-based harness below then takes `http://localhost:4190` as its
first argument. `static-server.mjs` takes `[root] [port]`, defaulting to
`out` and `4190` if omitted — pass a different port if 4190 is busy.

`png-diff.mjs` needs the `sharp` package, which is **not** a project
dependency (it was installed ad hoc when this was written). Run
`npm install sharp` first if you need it — don't add it to `package.json`
for a script you'll run rarely.

## The baseline discipline

Two habits that aren't obvious from reading the scripts, both load-bearing
for trusting the results:

1. **Pause before loading a preset, never after.** Loading a preset first
   lets the sim advance by an arbitrary wall-clock amount before the pause
   lands, so body positions — and therefore every pixel hash — differ
   between runs for reasons that have nothing to do with the code under
   test. Every harness that hashes canvas pixels or compares body
   coordinates clicks Pause *before* clicking the preset. If you add a new
   check in this style, keep that order.

2. **Validate the baseline against itself before trusting a diff.** Before
   comparing pre-refactor output to post-refactor output, run the harness
   twice against the *same* (pre-refactor) build and confirm the two runs
   match exactly. That establishes the run-to-run noise floor is zero, so
   a nonzero diff against the refactored build means the refactor changed
   something — not that the harness is merely noisy. `camera-verify.mjs`'s
   FNV-1a canvas hash and `run.mjs`/`control.mjs`'s position/velocity
   diffing both depend on this: skipping the self-check and going straight
   to old-vs-new is how you mistake inherent chaos for a regression.

## Browser harnesses (Playwright, need the static server running)

| Script | Phase | Invariant it asserts | Command |
|---|---|---|---|
| `verify.mjs` | 1 (static export) | Page loads, canvas renders, sim is animating (two pixel samples differ), no console errors | `node verification/verify.mjs http://localhost:4190 out.png` |
| `camera-verify.mjs` | 3a (camera-helper extraction) | Canvas is byte-identical (FNV-1a hash) across 7 viewport states and a hit-test probe grid, before vs. after the refactor | `node verification/camera-verify.mjs http://localhost:4190 <outDir> <label>` — run once per build, diff the two `<label>.json` files |
| `touch-verify.mjs` | 3b-2 (gesture state machine) | Pinch-zoom anchor drift, second-finger interrupts of spawn/grab, one-finger-lifted-from-pinch → LOCKED, pointercancel parity, long-press/tap thresholds, edge-drag cancel — 33 checks | `node verification/touch-verify.mjs http://localhost:4190` |
| `controls-verify.mjs` | 3b-3 (on-screen controls) | Rewind releases on all 4 paths (pointerup, slide-off, pointercancel, lostpointercapture, pointerleave), per-control spawn dead zone, open-canvas still spawns | `node verification/controls-verify.mjs http://localhost:4190` |
| `mode-verify.mjs` | 3b-3 (mode toggle) | Spawn/Pan segments are ≥48×48, single-finger behavior actually changes with mode, pinch bypasses mode entirely, dead zone covers the toggle itself | `node verification/mode-verify.mjs http://localhost:4190` |
| `interact-verify.mjs` | 3b-4 (coverage matrix) | Every keyboard/mouse-only binding has a touch equivalent; double-tap-to-follow is gone on touch while desktop double-click still works; editor panel never leaks a canvas gesture | `node verification/interact-verify.mjs http://localhost:4190` |
| `matrix-verify.mjs` | 3b-1 (single-pointer coverage) | Spawn, toolbar dead zone, click-to-edit, body grab, right-click delete, double-click follow, and the pointer-capture-survives-leaving-canvas measurement | `node verification/matrix-verify.mjs http://localhost:4190` |
| `sheet-verify.mjs` | 4b (control-layer restructure) | Presets/body-type/settings sheets open, list correctly, dismiss 3 ways (close button, backdrop tap, Escape), block canvas gestures while open and release them after; single-row bar fits at 4 form factors | `node verification/sheet-verify.mjs http://localhost:4190` |
| `phase4-verify.mjs` | 4 (safe-area insets, rotation) | Every control stays ≥48×48 and the dead zone tracks it under 3 simulated inset profiles; rotation preserves world-space centre and body positions to <1e-9; portrait controls stay on-screen | `node verification/phase4-verify.mjs http://localhost:4190` |
| `p4c-verify.mjs` | 4c/4d (back precedence, narrow width, preset accuracy, double-click) | Sheet-over-editor Escape precedence unwinds one layer at a time; body type reachable via sheet at 360px; preset type/pinned breakdown matches `presets.ts` source; double-click engages follow without opening the editor while touch is unaffected | `node verification/p4c-verify.mjs http://localhost:4190` |
| `share-verify.mjs` | web-first (share a scene) | Share round-trips bodies + speed through the URL hash; five classes of malformed/hostile hash (invalid base64, invalid JSON, non-array body list, NaN fields, 5000-body payload) all fail to decode cleanly without crashing the page or throwing a console error | `node verification/share-verify.mjs http://localhost:4190` |
| `snapshot-verify.mjs` | web-first (snapshot & clip) | "Save image" downloads a non-empty PNG; "Record 10s clip" shows a recording state, waits out the full 10s, and downloads a non-empty WebM | `node verification/snapshot-verify.mjs http://localhost:4190` |
| `my-scenes-verify.mjs` | web-first (my scenes) | Save/load/delete named scenes with a thumbnail, round-tripping through `localStorage` and surviving a real page reload | `node verification/my-scenes-verify.mjs http://localhost:4190` |
| `pwa-verify.mjs` | web-first (installable PWA) | Manifest is linked and valid (standalone display, 512×512 + maskable icons); the service worker reaches `activated`; a reload while offline still renders the canvas; a shared-scene link still restores correctly with the service worker installed | `node verification/pwa-verify.mjs http://localhost:4190` |

Each harness prints `PASS`/`FAIL` per check and a summary line; a nonzero
exit isn't wired up, so read the summary count, don't just check the exit
code.

## Pure-logic unit tests (no browser, no static server)

| Script | Phase | Invariant it asserts | Command |
|---|---|---|---|
| `tutorial-verify.mjs` | onboarding tutorial | Step state machine (advance/back/skip/orbit-fail/show-me transitions), persistence version-key policy, and the orbit-classification math (bound/escaping energy, tap-launch detection, angle-wraparound, a full synthetic circular orbit resolving to success, a fast departure resolving to escaped) — 36 checks | `node verification/tutorial-verify.mjs` |

Written as `.mjs` deliberately, not `.ts`, even though the logic under test
(`src/tutorial/*.ts`) is TypeScript: Next's own typecheck sweeps up
`**/*.ts` project-wide and rejects the explicit `.ts` extensions Node's ESM
loader requires on relative imports. Node's native type stripping (23.6+)
still handles the imported `.ts` modules transparently — only this file's
own extension needed to change. This exits nonzero on failure, unlike the
browser harnesses above.

## Debug probes (raw output, not pass/fail)

Kept because they're the actual evidence behind two durable rules, not
just scripts that happened to produce a number once.

| Script | What it proved | Command |
|---|---|---|
| `dbg-capture.mjs` | Whether `mouseleave`/`pointerleave`/`pointerout`/`lostpointercapture` still fire on the canvas while a pointer is captured — this is what showed `setPointerCapture` needed the try/catch wrapper (a released pointer throws `NotFoundError` on capture) | `node verification/dbg-capture.mjs http://localhost:4190` |
| `dbg-dblclick.mjs` | Logs the actual DOM event sequence a native double-click fires on the canvas — this is what proved double-click-opens-editor-AND-engages-follow was pre-existing behavior, not a regression introduced by the Escape-precedence unification | `node verification/dbg-dblclick.mjs http://localhost:4190` |

## Physics-only harnesses — historical proof, not turnkey re-runnable

`run.mjs` and `control.mjs` implement the Phase 3a-2 trajectory-identity
proof and its control experiment (perturbing the old code by ~1e-13 to
distinguish inherent chaos from a real behavioral change). Both import
plain-JS compiled output — `./out/presets-old.js`, `./out/presets-new.js`,
`./out/physics.js` relative to this directory — that was produced at the
time by compiling the pre- and post-3a-2 versions of `presets.ts` from the
working tree. That working tree no longer exists as a separate git revision
— all of Phases 1 through 4d landed in a single squashed commit (`eb35c98`),
so there is no commit boundary left to check out and recompile "old" from.

They're kept as a record of the methodology (see "baseline discipline"
above) and as a starting point if you need to re-derive a similar proof for
a future refactor — not as a script you can run today without first
manually reconstructing an `out/` with old-vs-new compiled presets.

## `static-server.mjs` / `png-diff.mjs`

Not harnesses themselves — shared infrastructure the ones above depend on.
`static-server.mjs` serves a static export for Playwright to drive;
`png-diff.mjs` diffs two screenshots pixel-by-pixel and reports the
differing-pixel count and bounding box (used alongside `camera-verify.mjs`'s
canvas hashes for a second, independent check).
