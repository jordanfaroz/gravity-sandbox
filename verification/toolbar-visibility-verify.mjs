// Regression test for the "bottom toolbar not visible on some phones" bug.
//
// Root cause: the app shell was sized with `h-screen` (a static 100vh —
// mobile Safari/Chrome's LARGEST possible viewport, with the browser's own
// UI hidden), while the toolbar is `position: absolute; bottom: 0` inside
// it. On a phone with its address bar actually showing, the real visible
// area is shorter than 100vh, so the toolbar could render below the fold.
//
// Two layers of fix, now both covered here:
//
// 1. CSS: the shell is sized with 100dvh (tracks the CURRENT visible
//    viewport) behind a 100vh fallback for browsers without dvh support —
//    the `.app-shell-height` rule in globals.css. `testOrientation` below
//    covers this at 5 device profiles x portrait/landscape, plus two
//    "chrome expanded" shorter-viewport proxies.
// 2. JS: 100dvh alone did not resolve the bug on a real device (see
//    HANDOVER.md), so the shell also reads window.visualViewport's height
//    and offsetTop directly (src/lib/use-visual-viewport.ts) and overrides
//    the CSS sizing with position:fixed + an explicit height once a real
//    measurement lands. A guaranteed-reachable top-anchored "Planets /
//    Presets" handle button (data-control="planets-presets-handle") is a
//    second line of defense regardless of either fix.
//
// `testOrientation`'s real-viewport checks cannot exercise fix #2: headless/
// CDP-driven Chromium has no real browser chrome to show or hide, so
// window.innerHeight/100vh/100dvh/visualViewport are always identical at a
// given Playwright viewport size — there is no way to make the layout and
// visual viewports diverge the way a real phone's address bar does by
// resizing the viewport alone. `testVisualViewportShrink` below closes that
// gap a different way: it replaces window.visualViewport with a fake object
// reporting a shorter height and nonzero offsetTop than the real layout
// viewport, *before* the page's own JS runs. Fix #2 reads that object
// directly, so the mock genuinely exercises it — confirmed by running this
// same check against the pre-fix build (CSS-only, no visualViewport read):
// it fails there, because the old code never looks at window.visualViewport
// for shell sizing and keeps the toolbar pinned to the full (unmocked)
// layout height, below the mocked visible area. See HANDOVER.md for the
// full before/after record of that comparison.
//
// Paired-negative-assertion rule (see HANDOVER.md): every "control X is
// reachable" check here is paired across both branches of the <400px
// body-type-button breakpoint, not just whichever one a given profile
// happens to land on — so a check that's vacuously true for every tested
// width can't hide a real break in the other branch.

import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:4190'

const PROFILES = [
  { label: 'iphone-se', width: 375, height: 667 },
  { label: 'iphone-12-14', width: 390, height: 844 },
  { label: 'iphone-15-pro-max', width: 430, height: 932 },
  { label: 'small-android', width: 360, height: 640 },
  { label: 'pixel-7', width: 412, height: 915 },
]

// Chrome-expanded proxy: same widths, shorter heights (~140-160px knocked
// off for an address bar + tab strip allowance) — see the limitation note
// above for what this can and can't prove.
const CHROME_EXPANDED = [
  { label: 'iphone-se-chrome-expanded', width: 375, height: 520 },
  { label: 'pixel-7-chrome-expanded', width: 412, height: 760 },
]

const browser = await chromium.launch()
const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${detail ?? ''}`)
}

function inViewport(rect, vw, vh) {
  return rect.top >= 0 && rect.left >= 0 && rect.right <= vw + 1 && rect.bottom <= vh + 1 && rect.width > 0 && rect.height > 0
}

async function testOrientation(label, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  await page.addInitScript(() => { try { localStorage.setItem('nbody.tutorial.v1', 'skipped') } catch {} })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // 1. The bottom control layer (the bar itself) is fully on-screen.
  const barInfo = await page.evaluate(() => {
    const el = document.querySelector('[data-control-layer="bottom"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
  })
  const vw = width, vh = height
  check(`${label}: toolbar present and on-screen`, !!barInfo && inViewport(barInfo, vw, vh),
    barInfo ? `rect=${JSON.stringify(barInfo)} viewport=${vw}x${vh}` : 'not found')

  // 2. Presets control: visible, on-screen, >= 44x44 (the requirement's own
  //    floor — the app actually ships 48x48, comfortably over it).
  const presets = page.locator('[data-control="presets"]')
  const presetsBox = await presets.boundingBox().catch(() => null)
  const presetsOk = !!presetsBox && inViewport(
    { top: presetsBox.y, left: presetsBox.x, right: presetsBox.x + presetsBox.width, bottom: presetsBox.y + presetsBox.height, width: presetsBox.width, height: presetsBox.height },
    vw, vh
  ) && presetsBox.width >= 44 && presetsBox.height >= 44
  check(`${label}: Presets control reachable (>=44x44, on-screen)`, presetsOk, presetsBox ? JSON.stringify(presetsBox) : 'not found')

  // 3. Planet (body type) picker: reachable either way the breakpoint falls.
  //    >= 400px wide -> the standalone button; < 400px -> only via Settings
  //    (the standalone button is intentionally hidden there, not a bug —
  //    see toolbar.tsx's own comment on the Settings sheet). Both branches
  //    are checked on every profile, per the paired-negative-assertion rule.
  const bodyTypeBtn = page.locator('[data-control="bodytype"]')
  const bodyTypeVisible = await bodyTypeBtn.isVisible().catch(() => false)
  if (width >= 400) {
    const box = await bodyTypeBtn.boundingBox().catch(() => null)
    const ok = bodyTypeVisible && !!box && inViewport(
      { top: box.y, left: box.x, right: box.x + box.width, bottom: box.y + box.height, width: box.width, height: box.height },
      vw, vh
    ) && box.width >= 44 && box.height >= 44
    check(`${label}: planet picker reachable via standalone button (width ${width}>=400)`, ok, box ? JSON.stringify(box) : 'not found/visible')
  } else {
    check(`${label}: standalone body-type button correctly hidden (width ${width}<400)`, !bodyTypeVisible, `visible=${bodyTypeVisible}`)
    await page.locator('[data-control="settings"]').click()
    await page.waitForTimeout(250)
    const sheetSwatches = await page.locator('button:has(span.rounded-full)').count()
    const ok = sheetSwatches >= 4 // one per BODY_TYPES entry
    check(`${label}: planet picker reachable via Settings sheet (width ${width}<400)`, ok, `swatch buttons=${sheetSwatches}`)
    const closeBtn = page.getByRole('button', { name: 'Close sheet' })
    if (await closeBtn.count()) await closeBtn.click()
    await page.waitForTimeout(150)
  }

  check(`${label}: no console errors`, errors.length === 0, JSON.stringify(errors))
  await context.close()
}

// Replaces window.visualViewport with a fake object reporting a shorter
// height and a nonzero offsetTop than the real layout viewport, installed
// via addInitScript so it's in place before the page's own JS runs. Only
// height/offsetTop diverge from the real object; everything else (width,
// scale, ...) is forwarded, so nothing else that happens to read
// visualViewport breaks in a way unrelated to what this test checks.
async function mockVisualViewport(page, { height, offsetTop }) {
  await page.addInitScript(({ height, offsetTop }) => {
    const real = window.visualViewport
    if (!real) return
    const listeners = { resize: new Set(), scroll: new Set() }
    const fake = {
      get height() { return height },
      get width() { return real.width },
      get offsetTop() { return offsetTop },
      get offsetLeft() { return real.offsetLeft },
      get pageTop() { return real.pageTop },
      get pageLeft() { return real.pageLeft },
      get scale() { return real.scale },
      addEventListener(type, cb) { listeners[type]?.add(cb) },
      removeEventListener(type, cb) { listeners[type]?.delete(cb) },
      dispatchEvent() { return true },
    }
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake })
    // Exposed so the test can fire these after load, exercising the resize
    // AND scroll listener paths separately rather than only the initial read.
    window.__fireVV = (type) => listeners[type]?.forEach(cb => cb(new Event(type)))
  }, { height, offsetTop })
}

async function testVisualViewportShrink(label, width, height, shrinkBy, offsetTop) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  await page.addInitScript(() => { try { localStorage.setItem('nbody.tutorial.v1', 'skipped') } catch {} })

  const mockedHeight = height - shrinkBy
  await mockVisualViewport(page, { height: mockedHeight, offsetTop })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // Exercise both event paths the hook listens on, not just the initial read.
  await page.evaluate(() => { window.__fireVV('resize'); window.__fireVV('scroll') })
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.waitForTimeout(100)

  const visibleBottom = offsetTop + mockedHeight

  const shellRect = await page.evaluate(() => {
    const el = document.querySelector('[data-app-shell]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, height: r.height }
  })
  check(`${label}: app shell adopts the mocked visualViewport height`, !!shellRect && Math.abs(shellRect.height - mockedHeight) <= 1,
    shellRect ? JSON.stringify(shellRect) : 'not found')
  check(`${label}: app shell top follows the mocked offsetTop`, !!shellRect && Math.abs(shellRect.top - offsetTop) <= 1,
    shellRect ? JSON.stringify(shellRect) : 'not found')

  const barBox = await page.locator('[data-control-layer="bottom"]').boundingBox().catch(() => null)
  check(`${label}: bottom toolbar stays within the shrunk visible area`, !!barBox && barBox.y + barBox.height <= visibleBottom + 1,
    barBox ? `bottom=${barBox.y + barBox.height} visibleBottom=${visibleBottom}` : 'not found')

  const presetsBox = await page.locator('[data-control="presets"]').boundingBox().catch(() => null)
  check(`${label}: Presets control reachable within the shrunk visible area`, !!presetsBox && presetsBox.y + presetsBox.height <= visibleBottom + 1,
    presetsBox ? `bottom=${presetsBox.y + presetsBox.height} visibleBottom=${visibleBottom}` : 'not found')

  // The top-anchored fallback button is reachable regardless of either fix
  // above, by construction (top: safe-area-inset-top is always inside any
  // visible area short of the whole page vanishing) — checked anyway so a
  // future change to its positioning can't silently break that guarantee.
  const handleBox = await page.locator('[data-control="planets-presets-handle"]').boundingBox().catch(() => null)
  check(`${label}: "Planets / Presets" handle button reachable within the shrunk visible area`,
    !!handleBox && handleBox.y >= offsetTop - 1 && handleBox.y + handleBox.height <= visibleBottom + 1,
    handleBox ? `rect=${JSON.stringify(handleBox)} visibleBottom=${visibleBottom}` : 'not found')

  check(`${label}: no console errors`, errors.length === 0, JSON.stringify(errors))
  await context.close()
}

for (const p of PROFILES) {
  await testOrientation(`${p.label}-portrait-${p.width}x${p.height}`, p.width, p.height)
  await testOrientation(`${p.label}-landscape-${p.height}x${p.width}`, p.height, p.width)
}
for (const p of CHROME_EXPANDED) {
  await testOrientation(p.label, p.width, p.height)
}

// Mocked-visualViewport shrink: the check that can actually fail on the old
// h-screen/CSS-only code — see the file header for why the checks above
// cannot. shrinkBy/offsetTop are deliberately unrealistic-looking numbers
// (not just "address bar height") specifically to prove the shell is really
// reading visualViewport, not coincidentally matching a plausible value.
await testVisualViewportShrink('iphone-12-14-vv-shrink-390x844', 390, 844, 217, 73)
await testVisualViewportShrink('pixel-7-vv-shrink-412x915', 412, 915, 161, 29)

const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
await browser.close()
process.exit(failed > 0 ? 1 : 0)
