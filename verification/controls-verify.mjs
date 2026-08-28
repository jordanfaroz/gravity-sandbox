// Phase 3b-3 control verification: rewind release paths, per-control spawn dead
// zone, and the keyboard -> touch coverage matrix.

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
const count = async () => Number((await page.locator('text=/\\d+ bodies/').first().innerText()).match(/(\d+)/)[1])
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) })

const results = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  results.push({ name, actual: a, expected: e, pass: a === e })
}

// Rewinding is visible through the button's aria-pressed state.
const rewinding = () => page.getByRole('button', { name: 'Rewind' }).getAttribute('aria-pressed')

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()

// ── Rewind must stop on all four release paths ──────────────────────────────
const rewindBox = await page.getByRole('button', { name: 'Rewind' }).boundingBox()
const RB = { x: rewindBox.x + rewindBox.width / 2, y: rewindBox.y + rewindBox.height / 2 }

// 1. pointerup on the button
await page.mouse.move(RB.x, RB.y)
await page.mouse.down()
await frames()
check('rewind starts on pointerdown', await rewinding(), 'true')
await page.mouse.up()
await frames()
check('rewind stops on pointerup', await rewinding(), 'false')

// 2. pointerup after sliding OFF the button (capture keeps events on the button)
await page.mouse.move(RB.x, RB.y)
await page.mouse.down()
await frames()
await page.mouse.move(RB.x, RB.y - 260, { steps: 5 })   // drag away, over the canvas
await frames()
await page.mouse.up()
await frames()
check('rewind stops after sliding off then releasing', await rewinding(), 'false')

// 3. pointercancel mid-hold
await page.mouse.move(RB.x, RB.y)
await page.mouse.down()
await frames()
check('rewind active before cancel', await rewinding(), 'true')
await page.evaluate(() => {
  const b = document.querySelector('[data-control="rewind"]')
  b.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))
})
await frames()
check('rewind stops on pointercancel', await rewinding(), 'false')
await page.mouse.up()
await frames()

// 4. lostpointercapture (browser revokes capture mid-hold)
await page.mouse.move(RB.x, RB.y)
await page.mouse.down()
await frames()
check('rewind active before capture loss', await rewinding(), 'true')
await page.evaluate(() => {
  const b = document.querySelector('[data-control="rewind"]')
  b.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))
})
await frames()
check('rewind stops on lostpointercapture', await rewinding(), 'false')
await page.mouse.up()
await frames()

// 5. pointerleave with no capture granted
await page.evaluate(() => {
  const b = document.querySelector('[data-control="rewind"]')
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 99 }))
})
await frames()
check('rewind active before leave', await rewinding(), 'true')
await page.evaluate(() => {
  const b = document.querySelector('[data-control="rewind"]')
  // React derives onPointerLeave from pointerout/pointerover rather than listening
  // for the non-bubbling pointerleave, so dispatch what it actually observes.
  b.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerId: 99, relatedTarget: document.body }))
})
await frames()
check('rewind stops on pointerleave', await rewinding(), 'false')

// ── Dead zone, verified per control ─────────────────────────────────────────
await page.getByRole('button', { name: 'Pause' }).click().catch(() => {})   // pause if running
await frames()

const controls = [
  ['rewind', 'Rewind'],
  ['play/pause', /^(Pause|Play)$/],
  ['spawn segment', 'Spawn mode'],
  ['pan segment', 'Pan mode'],
  ['presets button', 'Presets'],
  ['settings button', 'Settings'],
  ['body type button', /Body type:/],
]

for (const [label, name] of controls) {
  const el = page.getByRole('button', { name, exact: typeof name === 'string' }).first()
  const b = await el.boundingBox()
  if (!b) { check(`dead zone over ${label}: control found`, false, true); continue }
  const before = await count()
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }])
  await frames()
  await touch('touchEnd', [])
  await frames()
  check(`no spawn released over ${label}`, await count(), before)
}

// A release over a genuine gap in the control layer SHOULD still spawn — the check
// must track real hit-testing, not a blanket bottom-strip exclusion.
{
  const before = await count()
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: 300, y: 420, id: 1 }])
  await frames()
  await touch('touchEnd', [])
  await frames()
  check('spawn still works over open canvas', (await count()) === before + 1, true)
}

// ── Keyboard coverage matrix ───────────────────────────────────────────────
const hasControl = async (name, exact = true) =>
  (await page.getByRole('button', { name, exact }).count()) > 0

const matrix = [
  ['hold R', 'rewind', await hasControl('Rewind')],
  ['Escape (release follow)', 'Follow control in body editor', null],
  ['Escape (close editor)', 'editor close button + tap empty space', null],
]
check('keyboard: hold R has a touch control', matrix[0][2], true)

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(50)} actual=${r.actual} expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
const failed = results.filter(r => !r.pass).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
