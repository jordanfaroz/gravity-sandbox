// Phase 4b: sheets, single-row bar, and the dismissal paths.

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
const count = async () => Number((await page.evaluate(() => {
  const m = document.body.innerText.match(/(\d+)\s+bodies/)
  return m ? m[1] : '0'
})))
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) })

const results = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  results.push({ name, actual: a, expected: e, pass: a === e })
}
// Matched on the sheet's own marker: getByText would also match the toolbar
// button that opens it, which shares the same label.
const sheetOpen = (title) => page.locator('[data-sheet="' + title + '"]').count().then(c => c > 0)

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

// ── Presets sheet: opens, loads, and dismisses three ways ──────────────────
await page.getByRole('button', { name: 'Presets' }).click()
await frames()
check('presets sheet opens', await sheetOpen('Presets'), true)
check('all 11 presets listed', await page.getByRole('button', { name: /Binary Stars|Solar System|Figure-8|Slingshot|Black Hole Field|Galaxy Collision|3-Body Chaos|Trojans|Rogue Star|Double Binary|Pulsar/ }).count(), 11)

// full-width rows, comfortably tappable
const row = await page.getByRole('button', { name: /Solar System/ }).first().boundingBox()
check('preset row >= 48 tall', row.height >= 48, true)
check('preset row is wide (full-width list item)', row.width > 200, true)

await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()
check('choosing a preset loads it and closes the sheet', await sheetOpen('Presets'), false)
check('preset actually loaded', await count(), 6)

// dismiss: close control
await page.getByRole('button', { name: 'Presets' }).click()
await frames()
const closeBtn = await page.getByRole('button', { name: 'Close sheet' }).boundingBox()
check('sheet close control >= 48x48', closeBtn.width >= 48 && closeBtn.height >= 48, true)
await page.getByRole('button', { name: 'Close sheet' }).click()
await frames()
check('close control dismisses', await sheetOpen('Presets'), false)

// dismiss: tap outside (backdrop)
await page.getByRole('button', { name: 'Presets' }).click()
await frames()
await page.mouse.click(640, 80)   // well above the sheet
await frames()
check('tapping outside dismisses', await sheetOpen('Presets'), false)

// dismiss: hardware back, ahead of the body editor
await page.getByRole('button', { name: 'Presets' }).click()
await frames()
const backHandled = await page.evaluate(() => {
  // handleBack is exercised through the same precedence chain the Capacitor
  // listener calls; Escape is the desktop equivalent wired to the sheet.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  return true
})
await frames()
check('escape/back dismisses the sheet', backHandled && !(await sheetOpen('Presets')), true)

// ── Sheet blocks canvas gestures while open ────────────────────────────────
{
  await page.getByRole('button', { name: 'Presets' }).click()
  await frames()
  const before = await count()
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: 360, y: 300, id: 1 }])
  await frames()
  check('canvas gesture blocked while sheet open', (await gesture()).state, 'IDLE')
  await touch('touchEnd', [])
  await frames()
  check('no body spawned through the sheet backdrop', await count(), before)
  await page.getByRole('button', { name: 'Close sheet' }).click()
  await frames()
}

// PAIRED POSITIVE: the canvas must still work once the sheet is gone, or the
// check above would pass for a globally broken canvas.
{
  const before = await count()
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: 360, y: 300, id: 1 }])
  await frames()
  check('canvas gesture works after sheet closes', (await gesture()).state, 'SPAWNING')
  await touch('touchEnd', [])
  await frames()
  check('spawn commits after sheet closes', (await count()) === before + 1, true)
}

// ── Body type + settings sheets ────────────────────────────────────────────
await page.getByRole('button', { name: /Body type:/ }).click()
await frames()
check('body type sheet opens', await sheetOpen('Body type'), true)
await page.getByRole('button', { name: 'Star', exact: true }).first().click()
await frames()
check('choosing a type closes the sheet', await sheetOpen('Body type'), false)
check('bar reflects the new type', await page.getByRole('button', { name: 'Body type: Star' }).count(), 1)

await page.getByRole('button', { name: 'Settings' }).click()
await frames()
check('settings sheet opens', await sheetOpen('Settings'), true)
check('gravity slider present', await page.getByRole('slider', { name: 'Gravity' }).count(), 1)
check('speed slider present', await page.getByRole('slider', { name: 'Speed' }).count(), 1)
check('reset present', await page.getByRole('button', { name: 'Reset', exact: true }).count(), 1)
check('share present', await page.getByRole('button', { name: 'Share', exact: true }).count(), 1)
check('body type reachable inside settings', await page.getByRole('button', { name: 'Asteroid' }).count(), 1)
await page.getByRole('button', { name: 'Close sheet' }).click()
await frames()

// ── Single row, and no overflow, at four form factors ─────────────────────
for (const [label, w, h] of [['1280x800', 1280, 800], ['412x915', 412, 915], ['915x412', 915, 412], ['360x800', 360, 800]]) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(350)
  const m = await page.evaluate(() => {
    const layer = document.querySelector('[data-control-layer="bottom"]')
    const inner = layer.firstElementChild
    const lr = layer.getBoundingClientRect(), ir = inner.getBoundingClientRect()
    // Wrapping is detected by comparing the row's height against its tallest
    // child: distinct top values only reflect differing child heights.
    let tallest = 0
    for (const el of inner.children) {
      const r = el.getBoundingClientRect()
      if (r.width > 0) tallest = Math.max(tallest, r.height)
    }
    return {
      height: Math.round(lr.height),
      pct: Math.round(100 * lr.height / window.innerHeight),
      fits: ir.left >= -0.5 && ir.right <= window.innerWidth + 0.5,
      wrapped: ir.height > tallest + 4,
    }
  })
  check(`${label}: single row (${m.height}px, ${m.pct}% of screen)`, m.wrapped, false)
  check(`${label}: row fits within viewport`, m.fits, true)
  check(`${label}: bottom layer under 160px`, m.height < 160, true)
}
await page.setViewportSize({ width: 1280, height: 800 })

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(56)} actual=${r.actual} expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
const failed = results.filter(r => !r.pass).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
