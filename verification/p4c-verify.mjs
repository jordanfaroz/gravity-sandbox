// Phase 4c verification: sheet+editor precedence, narrow-width body-type
// reachability, and preset-description accuracy against actual generated state.

import { chromium } from 'playwright'

const [url] = process.argv.slice(2)
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
const page = await context.newPage()

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const gesture = () => page.evaluate(() => window.__gesture())
const sheetOpen = (title) => page.locator(`[data-sheet="${title}"]`).count().then(c => c > 0)
const editorOpen = () => page.getByRole('button', { name: 'Close' }).count().then(c => c > 0)
const following = () => page.getByRole('button', { name: /Stop following/ }).count().then(c => c > 0)
const esc = () => page.keyboard.press('Escape')

const results = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  results.push({ name, actual: a, expected: e, pass: a === e })
}

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Pause' }).click()
await page.getByRole('button', { name: 'Presets' }).click()
await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()

// ═══ 1. Sheet + editor precedence unwinding ═══════════════════════════════
{
  // Open the editor first, note its state, then open a sheet on top.
  const g = await gesture()
  const b = g.bodies[0]
  await page.mouse.click(b.x * g.viewport.scale + g.viewport.x, b.y * g.viewport.scale + g.viewport.y)
  await frames()
  check('editor open before sheet', await editorOpen(), true)

  // Give the body a name, so we can tell if its state survives the round trip.
  await page.getByPlaceholder('Star').fill('Sol')
  await frames()

  await page.getByRole('button', { name: 'Settings' }).click()
  await frames()
  check('sheet open on top of editor', await sheetOpen('Settings'), true)
  check('editor still open underneath (DOM)', await editorOpen(), true)

  // One Escape: must close ONLY the sheet.
  await esc()
  await frames()
  check('1st Escape closes the sheet', await sheetOpen('Settings'), false)
  check('1st Escape leaves the editor open', await editorOpen(), true)
  check('editor state survived (name field)', await page.getByPlaceholder('Star').inputValue(), 'Sol')

  // Second Escape: must close the editor.
  await esc()
  await frames()
  check('2nd Escape closes the editor', await editorOpen(), false)

  // Third Escape with nothing open: must not throw, not exit, not do anything odd.
  await esc()
  await frames()
  check('3rd Escape (nothing open) is a no-op', errors.length, 0)
}

// Repeat, framed explicitly as the hardware-back proxy: useNativeShell wires
// the SAME handleBack function to the Capacitor 'backButton' listener that Escape
// calls here. There is no second mechanism to test — Escape IS the back chain,
// just triggered by keyboard instead of the OS. A true on-device back-button press
// is a real-device recheck; this proves the shared function's precedence logic.
{
  const g = await gesture()
  const b = g.bodies[0]
  await page.mouse.click(b.x * g.viewport.scale + g.viewport.x, b.y * g.viewport.scale + g.viewport.y)
  await frames()
  await page.getByRole('button', { name: 'Presets' }).click()
  await frames()
  check('[chain] sheet open on top of editor', { sheet: await sheetOpen('Presets'), editor: await editorOpen() }, { sheet: true, editor: true })

  await esc()
  await frames()
  check('[chain] press 1 closed sheet only', { sheet: await sheetOpen('Presets'), editor: await editorOpen() }, { sheet: false, editor: true })

  await esc()
  await frames()
  check('[chain] press 2 closed the editor', await editorOpen(), false)
}

// PAIRED POSITIVE: canvas gestures still work after this whole sequence — proves
// the back chain didn't leave the gesture machine or editor state corrupted.
{
  const before = await page.evaluate(() => window.__gesture().bodies.length)
  await page.mouse.move(200, 200)
  await page.mouse.down()
  await page.mouse.move(260, 240, { steps: 4 })
  await page.mouse.up()
  await frames()
  const after = await page.evaluate(() => window.__gesture().bodies.length)
  check('canvas still functional after full back sequence', after, before + 1)
}

// ═══ 2. Body type at 360px: hidden from bar, reachable via sheet ═════════
{
  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(300)

  const barButton = await page.getByRole('button', { name: /^Body type:/ })
  check('360px: body-type bar button is hidden', await barButton.isVisible().catch(() => false), false)

  await page.getByRole('button', { name: 'Settings' }).click()
  await frames()
  check('360px: settings sheet opens', await sheetOpen('Settings'), true)

  const types = ['Star', 'Planet', 'Black Hole', 'Asteroid']
  let allBigEnough = true
  const sizes = []
  for (const t of types) {
    const btn = page.getByRole('button', { name: t, exact: true })
    const box = await btn.boundingBox()
    if (!box || box.width < 48 || box.height < 48) allBigEnough = false
    sizes.push(`${t}:${box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'MISSING'}`)
  }
  check(`360px: all 4 body types in sheet >= 48x48 (${sizes.join(' ')})`, allBigEnough, true)

  // Confirm choosing one actually changes state (reachable, not just visible).
  await page.getByRole('button', { name: 'Asteroid', exact: true }).click()
  await frames()
  const selected = await page.evaluate(() => document.querySelector('button[aria-pressed="true"]')?.textContent || null)
  check('360px: selecting a type in the sheet takes effect', selected?.includes('Asteroid'), true)

  await page.getByRole('button', { name: 'Close sheet' }).click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(300)
}

// ═══ 3. Preset descriptions vs actual generated state ═════════════════════
// Types and pinned status read directly from src/lib/presets.ts, cross-checked
// against the live app below rather than trusted on their own.
const EXPECTED = {
  binary:    { types: { star: 2 },                     pinned: [] },
  solar:     { types: { star: 1, planet: 5 },           pinned: ['star'] },
  figure8:   { types: { planet: 3 },                    pinned: [] },
  slingshot: { types: { planet: 1, asteroid: 12 },      pinned: ['planet'] },
  blackhole: { types: { blackhole: 1, asteroid: 24 },   pinned: ['blackhole'] },
  galaxy:    { types: { blackhole: 2, star: 2, planet: 6 }, pinned: [] },
  chaos:     { types: { star: 3 },                      pinned: [] },
  trojan:    { types: { star: 1, planet: 1, asteroid: 14 }, pinned: ['star'] },
  rogue:     { types: { star: 2, planet: 4 },           pinned: ['star'] },
  quadruple: { types: { star: 4 },                      pinned: [] },
  pulsar:    { types: { blackhole: 1, star: 1, asteroid: 10 }, pinned: [] },
}


await page.getByRole('button', { name: 'Presets' }).click()
await frames()
const labelToKey = {
  'Binary Stars': 'binary', 'Solar System': 'solar', 'Figure-8': 'figure8',
  'Slingshot': 'slingshot', 'Black Hole Field': 'blackhole', 'Galaxy Collision': 'galaxy',
  '3-Body Chaos': 'chaos', 'Trojans': 'trojan', 'Rogue Star': 'rogue',
  'Double Binary': 'quadruple', 'Pulsar': 'pulsar',
}
const blurbs = {}
for (const [label] of Object.entries(labelToKey)) {
  const row = page.getByRole('button', { name: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
  blurbs[label] = await row.locator('div').nth(1).innerText()
}
await esc()
await frames()

for (const [label, key] of Object.entries(labelToKey)) {
  await page.getByRole('button', { name: 'Presets' }).click()
  await frames()
  await page.getByRole('button', { name: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  await frames()
  const g = await gesture()
  const exp = EXPECTED[key]

  const actualTypes = {}
  for (const b of g.bodies) actualTypes[b.type] = (actualTypes[b.type] || 0) + 1
  const expectedCount = Object.values(exp.types).reduce((a, b) => a + b, 0)
  check(
    `preset "${label}": type breakdown matches source (blurb: "${blurbs[label]}")`,
    { count: g.bodies.length, types: actualTypes },
    { count: expectedCount, types: exp.types }
  )

  const actualPinnedTypes = [...new Set(g.bodies.filter(b => b.pinned).map(b => b.type))].sort()
  check(`preset "${label}": pinned bodies match source`, actualPinnedTypes, [...exp.pinned].sort())
}

// ═══ 4. Phase 4d: double-click no longer leaves the editor open ═══════════
{
  await page.getByRole('button', { name: 'Presets' }).click()
  await frames()
  await page.getByRole('button', { name: /Solar System/ }).first().click()
  await frames()
  const g = await gesture()
  const b = g.bodies[0]
  const sx = b.x * g.viewport.scale + g.viewport.x, sy = b.y * g.viewport.scale + g.viewport.y

  // Single click: editor still opens, unaffected by this phase.
  await page.mouse.click(sx, sy)
  await frames()
  check('4d: single click still opens editor', await editorOpen(), true)
  await esc()
  await frames()
  check('4d: escape closes it', await editorOpen(), false)

  // Double-click: follow engages, editor does NOT open, one Escape exits fully.
  await page.mouse.dblclick(sx, sy)
  await frames()
  check('4d: double-click engages follow', await following(), true)
  check('4d: double-click leaves editor CLOSED', await editorOpen(), false)
  await esc()
  await frames()
  check('4d: single escape fully releases follow', await following(), false)
}

// PAIRED POSITIVE: touch path is unaffected — double-tap still does nothing, and
// the editor's Follow toggle is still how touch engages/releases follow.
{
  const cdp = await context.newCDPSession(page)
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) })

  const g = await gesture()
  const b = g.bodies[0]
  const sx = b.x * g.viewport.scale + g.viewport.x, sy = b.y * g.viewport.scale + g.viewport.y

  for (let i = 0; i < 2; i++) {
    await touch('touchStart', [{ x: sx, y: sy, id: 1 }])
    await touch('touchEnd', [])
    await frames()
  }
  check('4d: double-TAP still does not engage follow (touch unaffected)', await following(), false)
  check('4d: editor open from the taps (touch behaviour unchanged)', await editorOpen(), true)

  await page.getByRole('button', { name: /Follow this body/ }).click()
  await frames()
  check('4d: editor Follow toggle still engages follow on touch', await following(), true)
  await page.getByRole('button', { name: /Following/ }).first().click()
  await frames()
  check('4d: editor Follow toggle still releases follow on touch', await following(), false)
  await page.getByRole('button', { name: 'Close' }).click()
  await frames()
}

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(64)} actual=${r.actual} expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
const failed = results.filter(r => !r.pass).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
