// Phase 4 verification: safe-area insets and rotation, without a device.
//
// Insets are simulated by padding the control layer, since env() resolves to 0 in
// a desktop Chromium. That exercises the layout consequences (controls move, the
// dead zone follows, the editor clamps) but NOT the platform behaviour of env()
// itself — on-device recheck still required.

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
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) })

const results = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  results.push({ name, actual: a, expected: e, pass: a === e })
}

// Simulated inset values: none, a realistic Android gesture-nav bar, and a notch.
const INSETS = [
  { label: 'inset 0', top: 0, bottom: 0 },
  { label: 'gesture-nav bottom 48', top: 0, bottom: 48 },
  { label: 'notch top 44 + nav 48', top: 44, bottom: 48 },
]

const applyInsets = async ({ top, bottom }) => {
  await page.evaluate(([t, b]) => {
    document.getElementById('sim-insets')?.remove()
    const el = document.createElement('style')
    el.id = 'sim-insets'
    el.textContent = `
      [data-control-layer="bottom"] { padding-bottom: calc(1rem + ${b}px) !important; }
      [data-control-layer="top"] { margin-top: ${t}px !important; }
    `
    document.head.appendChild(el)
  }, [top, bottom])
  await frames()
  await page.waitForTimeout(120)
}

const CONTROLS = [
  ['rewind', 'Rewind'],
  ['play/pause', /^(Pause|Play)$/],
  ['spawn', 'Spawn mode'],
  ['pan', 'Pan mode'],
  ['presets', 'Presets'],
]

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Pause' }).click()
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()

for (const inset of INSETS) {
  await applyInsets(inset)

  // 1. EVERY visible interactive control, not just a chosen few.
  const small = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('button, input, [role=button]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.width < 48 || r.height < 48) {
        const label = (el.getAttribute('aria-label') || el.textContent || el.type || el.tagName).trim()
        out.push(`${label.slice(0, 16)}:${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    return out
  })
  check(
    `${inset.label}: every control >= 48x48${small.length ? ' [' + small.join(' ') + ']' : ''}`,
    small.length, 0
  )

  // 2. Dead zone still correct, per control
  let deadZoneOk = true
  for (const [, name] of CONTROLS) {
    const b = await page.getByRole('button', { name }).first().boundingBox()
    const before = await count()
    await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
    await touch('touchMove', [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }])
    await frames()
    await touch('touchEnd', [])
    await frames()
    if ((await count()) !== before) deadZoneOk = false
  }
  check(`${inset.label}: no spawn over any control`, deadZoneOk, true)

  // 3. Open canvas still spawns (the dead zone did not swallow the whole screen)
  {
    const before = await count()
    await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
    await touch('touchMove', [{ x: 340, y: 300, id: 1 }])
    await frames()
    await touch('touchEnd', [])
    await frames()
    check(`${inset.label}: open canvas still spawns`, (await count()) === before + 1, true)
  }

  // 4. Editor panel must not overlap any control layer
  {
    const g = await gesture()
    const b = g.bodies[0]
    const sx = b.x * g.viewport.scale + g.viewport.x
    const sy = b.y * g.viewport.scale + g.viewport.y
    await touch('touchStart', [{ x: sx, y: sy, id: 1 }])
    await touch('touchEnd', [])
    await frames()
    const overlap = await page.evaluate(() => {
      const panel = document.querySelector('[data-editor-panel]')
      if (!panel) return 'no panel'
      const p = panel.getBoundingClientRect()
      for (const el of document.querySelectorAll('[data-control-layer]')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const hit = p.left < r.right && p.right > r.left && p.top < r.bottom && p.bottom > r.top
        if (hit) return `overlaps ${el.getAttribute('data-control-layer')}`
      }
      return 'clear'
    })
    check(`${inset.label}: editor panel clear of control layers`, overlap, 'clear')
    const close = page.getByRole('button', { name: 'Close' })
    if (await close.count()) { await close.click(); await frames() }
  }
}

await applyInsets({ top: 0, bottom: 0 })

// ── Rotation: world-space centre and body positions preserved ───────────────
{
  const before = await gesture()
  const centreBefore = {
    x: (1280 / 2 - before.viewport.x) / before.viewport.scale,
    y: (800 / 2 - before.viewport.y) / before.viewport.scale,
  }
  const bodiesBefore = before.bodies.map(b => `${b.x.toFixed(6)},${b.y.toFixed(6)}`).join('|')

  await page.setViewportSize({ width: 800, height: 1280 })   // portrait
  await page.waitForTimeout(400)
  await frames()
  const land = await gesture()
  const centreLand = {
    x: (800 / 2 - land.viewport.x) / land.viewport.scale,
    y: (1280 / 2 - land.viewport.y) / land.viewport.scale,
  }
  const driftRotate = Math.hypot(centreLand.x - centreBefore.x, centreLand.y - centreBefore.y)
  check(`rotation preserves world centre (drift ${driftRotate.toExponential(2)})`, driftRotate < 1e-9, true)

  await page.setViewportSize({ width: 1280, height: 800 })   // back to landscape
  await page.waitForTimeout(400)
  await frames()
  const after = await gesture()
  const centreAfter = {
    x: (1280 / 2 - after.viewport.x) / after.viewport.scale,
    y: (800 / 2 - after.viewport.y) / after.viewport.scale,
  }
  const driftBack = Math.hypot(centreAfter.x - centreBefore.x, centreAfter.y - centreBefore.y)
  check(`round trip preserves world centre (drift ${driftBack.toExponential(2)})`, driftBack < 1e-9, true)
  check('rotation leaves scale unchanged', after.viewport.scale === before.viewport.scale, true)

  const bodiesAfter = after.bodies.map(b => `${b.x.toFixed(6)},${b.y.toFixed(6)}`).join('|')
  check('rotation leaves body positions unchanged', bodiesAfter === bodiesBefore, true)
  check('gesture machine still IDLE after rotation', after.state, 'IDLE')
}

// ── Portrait: controls still fit and are reachable ─────────────────────────
{
  await page.setViewportSize({ width: 412, height: 915 })   // typical phone
  await page.waitForTimeout(400)
  await frames()
  let ok = true
  const boxes = []
  for (const [label, name] of CONTROLS) {
    const b = await page.getByRole('button', { name }).first().boundingBox()
    if (!b || b.width < 48 || b.height < 48) ok = false
    if (b) boxes.push(`${label}:${Math.round(b.width)}x${Math.round(b.height)}`)
  }
  check(`portrait 412x915: controls >= 48x48 (${boxes.join(' ')})`, ok, true)

  const onScreen = await page.evaluate(() => {
    const layer = document.querySelector('[data-control-layer="bottom"]')
    const r = layer.getBoundingClientRect()
    return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight + 1
  })
  check('portrait: bottom control layer fully on screen', onScreen, true)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(300)
}

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(62)} actual=${r.actual} expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
const failed = results.filter(r => !r.pass).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
