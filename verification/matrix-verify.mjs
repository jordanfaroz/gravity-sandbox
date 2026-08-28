// Phase 3b-4: verify every keyboard/mouse-only binding now has a working touch path,
// and that double-tap-to-follow is gone on touch while double-click survives on desktop.

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

const following = () => page.getByRole('button', { name: /Stop following/ }).count().then(c => c > 0)
const editorOpen = () => page.getByRole('button', { name: 'Close' }).count().then(c => c > 0)
const sunScreen = async () => {
  const g = await gesture()
  const b = g.bodies[0]
  return { x: b.x * g.viewport.scale + g.viewport.x, y: b.y * g.viewport.scale + g.viewport.y }
}
const tapBody = async () => {
  const s = await sunScreen()
  await touch('touchStart', [{ x: s.x, y: s.y, id: 1 }])
  await touch('touchEnd', [])
  await frames()
}

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Pause' }).click()
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()

// ── Touch target sizes ──────────────────────────────────────────────────────
await tapBody()
check('tap on body opens editor', await editorOpen(), true)
for (const [label, name] of [['close ×', 'Close'], ['follow toggle', /Follow this body|Following/], ['delete', /Delete body/]]) {
  const b = await page.getByRole('button', { name }).first().boundingBox()
  check(`${label} target >= 48x48`, b && b.width >= 48 && b.height >= 48, true)
}

// ── Escape (release follow) now has a touch path: editor toggle ────────────
check('not following initially', await following(), false)
await page.getByRole('button', { name: /Follow this body/ }).click()
await frames()
check('editor Follow toggle engages follow', await following(), true)
check('toggle now reads as following', await page.getByRole('button', { name: /Following/ }).first().isVisible(), true)

// ── Status chip releases follow without re-finding the body ───────────────
await page.getByRole('button', { name: 'Close' }).click()
await frames()
check('editor closed via × ', await editorOpen(), false)
check('still following after closing editor', await following(), true)
await page.getByRole('button', { name: /Stop following/ }).click()
await frames()
check('status chip releases follow', await following(), false)

// ── Editor toggle also releases (second tap) ──────────────────────────────
await tapBody()
await page.getByRole('button', { name: /Follow this body/ }).click()
await frames()
check('re-engaged follow', await following(), true)
await page.getByRole('button', { name: /Following/ }).first().click()
await frames()
check('editor toggle releases follow', await following(), false)
await page.getByRole('button', { name: 'Close' }).click()
await frames()

// ── Double-tap on touch must NOT engage follow any more ───────────────────
{
  const s = await sunScreen()
  for (let i = 0; i < 2; i++) {
    await touch('touchStart', [{ x: s.x, y: s.y, id: 1 }])
    await touch('touchEnd', [])
    await frames()
  }
  check('double-tap does not engage follow on touch', await following(), false)
  if (await editorOpen()) { await page.getByRole('button', { name: 'Close' }).click(); await frames() }
}

// ── Desktop double-click still engages follow ─────────────────────────────
{
  const s = await sunScreen()
  await page.keyboard.press('Escape')
  await frames()
  await page.mouse.dblclick(s.x, s.y)
  await frames()
  check('desktop double-click still engages follow', await following(), true)
  // Phase 4d: handleDoubleClick closes the editor itself when engaging follow, so
  // this is back to a single Escape (was two presses under the Phase 4c fix).
  check('double-click leaves editor closed (Phase 4d)', await editorOpen(), false)
  await page.keyboard.press('Escape')
  await frames()
  check('single Escape releases follow on desktop', await following(), false)
}

// Single click on a body still opens the editor as before — only the DOUBLE-click
// path changed in Phase 4d.
{
  const s = await sunScreen()
  await page.mouse.click(s.x, s.y)
  await frames()
  check('single click still opens the editor (Phase 4d unaffected)', await editorOpen(), true)
  await page.keyboard.press('Escape')
  await frames()
  check('escape closes it', await editorOpen(), false)
}

// ── Delete by touch (replaces right-click) ────────────────────────────────
{
  await tapBody()
  const before = await count()
  await page.getByRole('button', { name: /Delete body/ }).click()
  await frames()
  check('editor Delete removes the body', (await count()) === before - 1, true)
}

// ── Editor panel must never start a canvas gesture ─────────────────────────
// Note: a spawn drag STARTED on the canvas closes the editor (startSpawn clears
// it), so a drag can never be released over an open panel. The real risk is the
// opposite: a press landing on the panel leaking through to the canvas.
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()
await tapBody()
check('editor open for panel checks', await editorOpen(), true)

for (const [label, name] of [['follow toggle', /Follow this body|Following/], ['delete', /Delete body/], ['close ×', 'Close']]) {
  if (!(await editorOpen())) { await tapBody() }
  const loc = page.getByRole('button', { name }).first()
  const b = (await loc.count()) ? await loc.boundingBox() : null
  if (!b) { check(`panel check: ${label} present`, false, true); continue }
  const before = await count()
  await touch('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }])
  await frames()
  const g = await gesture()
  check(`press on editor ${label} starts no canvas gesture`, g.state, 'IDLE')
  await touch('touchEnd', [])
  await frames()
  // Not "count unchanged": tapping Delete legitimately removes a body. The
  // invariant is that no body is ADDED by a press that landed on the panel.
  check(`press on editor ${label} spawns nothing`, (await count()) <= before, true)
}

// And confirm the documented interaction: a canvas drag closes the editor.
if (!(await editorOpen())) await tapBody()
check('editor open before canvas drag', await editorOpen(), true)
await touch('touchStart', [{ x: 200, y: 200, id: 1 }])
await touch('touchMove', [{ x: 320, y: 300, id: 1 }])
await frames()
check('starting a canvas drag closes the editor', await editorOpen(), false)
await touch('touchEnd', [])
await frames()

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(50)} actual=${r.actual} expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
const failed = results.filter(r => !r.pass).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
