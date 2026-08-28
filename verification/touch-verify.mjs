// Phase 3b-2 gesture verification.
//
// Playwright's touchscreen API is single-touch, so multi-touch is driven through
// CDP Input.dispatchTouchEvent with two touch points. These are SYNTHETIC events:
// they exercise the state machine faithfully but do not reproduce real digitiser
// timing, palm rejection, or Android's own gesture interception. Every case here is
// a real-device recheck later, not a pass.

import { chromium } from 'playwright'

const [url] = process.argv.slice(2)
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const gesture = () => page.evaluate(() => window.__gesture())
const count = async () => Number((await page.locator('text=/\\d+ bodies/').first().innerText()).match(/(\d+)/)[1])
const zoomNow = async () => parseFloat((await page.locator('[title="Reset view"]').innerText()).replace('×', ''))
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) })

const results = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  results.push({ name, actual: a, expected: e, pass: a === e })
}

// A stuck non-IDLE state means no further input is accepted at all until relaunch,
// so this runs after every case.
const assertIdle = async (label) => {
  const g = await gesture()
  check(`${label} -> IDLE, map empty`,
    { state: g.state, pointers: g.pointers.length, spawning: g.spawning, grabbing: g.grabbing, panning: g.panning },
    { state: 'IDLE', pointers: 0, spawning: false, grabbing: false, panning: false })
}

const sunScreen = async () => {
  const g = await gesture()
  const b = g.bodies[0]
  return { x: b.x * g.viewport.scale + g.viewport.x, y: b.y * g.viewport.scale + g.viewport.y }
}

const heaviest = async () => {
  const g = await gesture()
  return g.bodies[0] ?? null   // sun is index 0 in the Solar System preset
}

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()

// ── 1. Pinch anchor stays fixed under the midpoint, zooming in and out ────────
for (const [label, spread] of [['pinch in ', 1.9], ['pinch out', 0.55]]) {
  const MID = { x: 520, y: 330 }
  const g0 = await gesture()
  const sun0 = g0.bodies[0]
  const z0 = await zoomNow()
  const vp0 = g0.viewport
  const d0 = 140

  await touch('touchStart', [{ x: MID.x - d0, y: MID.y, id: 1 }, { x: MID.x + d0, y: MID.y, id: 2 }])
  await frames()
  for (const t of [0.35, 0.7, 1]) {
    const d = d0 + (d0 * spread - d0) * t
    await touch('touchMove', [{ x: MID.x - d, y: MID.y, id: 1 }, { x: MID.x + d, y: MID.y, id: 2 }])
    await frames()
  }
  await touch('touchEnd', [])
  await frames()

  const z1 = await zoomNow()
  check(`${label}: scale changed`, z1 !== z0, true)
  // The real anchored-zoom invariant: the WORLD point under the pinch midpoint must
  // be the same before and after, even though the scale changed underneath it.
  const vp1 = (await gesture()).viewport
  const w0 = { x: (MID.x - vp0.x) / vp0.scale, y: (MID.y - vp0.y) / vp0.scale }
  const w1 = { x: (MID.x - vp1.x) / vp1.scale, y: (MID.y - vp1.y) / vp1.scale }
  const drift = Math.hypot(w1.x - w0.x, w1.y - w0.y)
  check(`${label}: anchor drift ${drift.toFixed(4)} < 0.5 world units`, drift < 0.5, true)
  await assertIdle(label)
}

// Anchor invariant measured directly: world point under the midpoint is unchanged.
{
  const MID = { x: 480, y: 300 }
  const worldAtMid = () => page.evaluate((m) => {
    const g = window.__gesture()
    return g.__world ? null : null
  }, MID)
  void worldAtMid
}

// ── 2. Second finger mid-spawn-drag -> no body created on release ─────────────
{
  const before = await count()
  await touch('touchStart', [{ x: 250, y: 180, id: 1 }])
  await touch('touchMove', [{ x: 340, y: 240, id: 1 }])
  await frames()
  check('spawn drag reached SPAWNING', (await gesture()).state, 'SPAWNING')
  await touch('touchStart', [{ x: 340, y: 240, id: 1 }, { x: 700, y: 380, id: 2 }])
  await frames()
  const g = await gesture()
  check('2nd finger -> PINCHING, spawn discarded', { state: g.state, spawning: g.spawning },
    { state: 'PINCHING', spawning: false })
  await touch('touchMove', [{ x: 300, y: 220, id: 1 }, { x: 760, y: 420, id: 2 }])
  await frames()
  await touch('touchEnd', [])
  await frames()
  check('no body created on release', await count(), before)
  await assertIdle('pinch-interrupted spawn')
}

// ── 3. Second finger mid-body-grab -> body not displaced by the pinch ─────────
{
  const SUN = await sunScreen()
  await touch('touchStart', [{ x: SUN.x, y: SUN.y, id: 1 }])
  await page.waitForTimeout(460)
  await frames()
  check('long-press reached GRABBING', (await gesture()).state, 'GRABBING')
  const before = await heaviest()

  await touch('touchStart', [{ x: SUN.x, y: SUN.y, id: 1 }, { x: 900, y: 300, id: 2 }])
  await frames()
  const g = await gesture()
  check('2nd finger during grab -> PINCHING, grab released', { state: g.state, grabbing: g.grabbing },
    { state: 'PINCHING', grabbing: false })

  await touch('touchMove', [{ x: SUN.x - 120, y: SUN.y - 90, id: 1 }, { x: 980, y: 360, id: 2 }])
  await frames()
  await touch('touchEnd', [])
  await frames()
  const after = await heaviest()
  check('grabbed body not displaced by the pinch',
    Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9, true)
  await assertIdle('pinch-interrupted grab')
}

// ── 4. Lifting one finger from a pinch -> LOCKED, no phantom pan/spawn ────────
{
  await touch('touchStart', [{ x: 400, y: 300, id: 1 }, { x: 700, y: 380, id: 2 }])
  await frames()
  await touch('touchMove', [{ x: 380, y: 290, id: 1 }, { x: 720, y: 420, id: 2 }])
  await frames()
  // CDP touchEnd takes the points being RELEASED, not the ones remaining.
  await touch('touchEnd', [{ x: 720, y: 420, id: 2 }])   // release finger 2, finger 1 stays down
  await frames()
  check('one finger lifted from pinch -> LOCKED', (await gesture()).state, 'LOCKED')

  const before = await count()
  const sunBefore = await heaviest()
  await touch('touchMove', [{ x: 150, y: 700, id: 1 }])   // long drag: must do nothing
  await frames()
  const g = await gesture()
  check('LOCKED ignores movement', { state: g.state, spawning: g.spawning, panning: g.panning },
    { state: 'LOCKED', spawning: false, panning: false })
  await touch('touchEnd', [])
  await frames()
  check('no phantom body from leftover finger', await count(), before)
  const sunAfter = await heaviest()
  check('no phantom body drag', Math.abs(sunAfter.x - sunBefore.x) < 1e-9, true)
  await assertIdle('pinch -> lift one finger')
}

// ── 5. pointercancel mid-gesture == same end state as pointerup ──────────────
{
  const before = await count()
  await touch('touchStart', [{ x: 260, y: 200, id: 1 }])
  await touch('touchMove', [{ x: 360, y: 260, id: 1 }])
  await frames()
  check('drag active before cancel', (await gesture()).state, 'SPAWNING')
  await touch('touchCancel', [])
  await frames()
  check('cancel discards the spawn (no body)', await count(), before)
  check('cancel reason recorded as os-cancel', (await gesture()).cancelReason, 'os-cancel')
  await assertIdle('pointercancel mid-drag')
}

// ── 6. Long-press threshold either side of 400 ms ────────────────────────────
for (const [ms, expected] of [[340, 'PENDING'], [470, 'GRABBING']]) {
  const s = await sunScreen()
  await touch('touchStart', [{ x: s.x, y: s.y, id: 1 }])
  await page.waitForTimeout(ms)
  await frames()
  check(`held ${ms}ms on a body -> ${expected}`, (await gesture()).state, expected)
  await touch('touchEnd', [])
  await frames()
  await assertIdle(`long-press ${ms}ms`)
  await page.keyboard.press('Escape')
  await frames()
}

// ── 7. Tap vs drag classification either side of 10 px ──────────────────────
for (const [dx, expected] of [[9, 'PENDING'], [11, 'SPAWNING']]) {
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: 300 + dx, y: 250, id: 1 }])
  await frames()
  check(`moved ${dx}px -> ${expected}`, (await gesture()).state, expected)
  await touch('touchEnd', [])
  await frames()
  await assertIdle(`${dx}px movement`)
  await page.keyboard.press('Escape')
  await frames()
}

// ── 8. Drag off the canvas edge entirely, then cancel ───────────────────────
{
  const before = await count()
  await touch('touchStart', [{ x: 200, y: 300, id: 1 }])
  await touch('touchMove', [{ x: 40, y: 120, id: 1 }])
  await frames()
  await touch('touchMove', [{ x: 0, y: 0, id: 1 }])
  await frames()
  await touch('touchCancel', [])
  await frames()
  await assertIdle('drag off canvas edge + cancel')
  check('no stranded body from edge drag', await count(), before)
}

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(54)} actual=${r.actual} expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
const failed = results.filter(r => !r.pass).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
