// Mode toggle verification. Pan mode being unreachable by touch was the blocker,
// so this checks the toggle actually changes single-finger behaviour, and that
// two-finger pinch bypasses the mode entirely.

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
const setMode = async (m) => {
  await page.getByRole('button', { name: m === 'spawn' ? 'Spawn mode' : 'Pan mode' }).click()
  await frames()
}
const modeOf = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button[aria-label$=" mode"]')]
  const on = b.find(x => x.getAttribute('aria-pressed') === 'true')
  return on ? on.getAttribute('aria-label').replace(' mode', '').replace(/^./, c => c.toUpperCase()) : null
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()

// Toggle is visible, reflects state, and both segments are >= 48x48 CSS px
const box = async (name) => page.getByRole('button', { name }).boundingBox()
const spawnBox = await box('Spawn mode'), panBox = await box('Pan mode')
check('spawn segment >= 48x48', spawnBox.width >= 48 && spawnBox.height >= 48, true)
check('pan segment >= 48x48', panBox.width >= 48 && panBox.height >= 48, true)
check('default mode is Spawn', await modeOf(), 'Spawn')

// ── Single finger in SPAWN mode drags out a new body ────────────────────────
await setMode('spawn')
check('toggle reports Spawn', await modeOf(), 'Spawn')
{
  const before = await count()
  const vp0 = (await gesture()).viewport
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: 400, y: 320, id: 1 }])
  await frames()
  check('spawn mode: 1 finger -> SPAWNING', (await gesture()).state, 'SPAWNING')
  await touch('touchEnd', [])
  await frames()
  check('spawn mode: body created', (await count()) === before + 1, true)
  const vp1 = (await gesture()).viewport
  check('spawn mode: camera did not move', vp0.x === vp1.x && vp0.y === vp1.y, true)
}

// ── Single finger in PAN mode moves the camera and creates nothing ──────────
await setMode('pan')
check('toggle reports Pan', await modeOf(), 'Pan')
{
  const before = await count()
  const vp0 = (await gesture()).viewport
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: 400, y: 320, id: 1 }])
  await frames()
  check('pan mode: 1 finger -> PANNING', (await gesture()).state, 'PANNING')
  await touch('touchMove', [{ x: 460, y: 380, id: 1 }])
  await frames()
  await touch('touchEnd', [])
  await frames()
  const vp1 = (await gesture()).viewport
  check('pan mode: camera moved', vp0.x !== vp1.x || vp0.y !== vp1.y, true)
  check('pan mode: no body created', await count(), before)
  check('pan mode: returns to IDLE', (await gesture()).state, 'IDLE')
}

// ── Tap on empty space must not spawn while in pan mode ────────────────────
{
  const before = await count()
  await touch('touchStart', [{ x: 250, y: 200, id: 1 }])
  await touch('touchEnd', [])
  await frames()
  check('pan mode: tap creates nothing', await count(), before)
}

// ── Two-finger pinch bypasses the mode: identical in both ──────────────────
const pinchDelta = async () => {
  const MID = { x: 520, y: 330 }
  const vp0 = (await gesture()).viewport
  await touch('touchStart', [{ x: MID.x - 140, y: MID.y, id: 1 }, { x: MID.x + 140, y: MID.y, id: 2 }])
  await frames()
  for (const d of [180, 220, 260]) {
    await touch('touchMove', [{ x: MID.x - d, y: MID.y, id: 1 }, { x: MID.x + d, y: MID.y, id: 2 }])
    await frames()
  }
  await touch('touchEnd', [])
  await frames()
  const vp1 = (await gesture()).viewport
  // Anchor invariant, plus the scale ratio the gesture produced
  const w0 = { x: (MID.x - vp0.x) / vp0.scale, y: (MID.y - vp0.y) / vp0.scale }
  const w1 = { x: (MID.x - vp1.x) / vp1.scale, y: (MID.y - vp1.y) / vp1.scale }
  return { ratio: +(vp1.scale / vp0.scale).toFixed(6), drift: Math.hypot(w1.x - w0.x, w1.y - w0.y) }
}

await setMode('spawn')
const pinchInSpawn = await pinchDelta()
await setMode('pan')
const pinchInPan = await pinchDelta()
check('pinch ratio identical in both modes', pinchInSpawn.ratio === pinchInPan.ratio, true)
check(`pinch anchor drift ~0 in spawn (${pinchInSpawn.drift.toFixed(4)})`, pinchInSpawn.drift < 0.5, true)
check(`pinch anchor drift ~0 in pan (${pinchInPan.drift.toFixed(4)})`, pinchInPan.drift < 0.5, true)
check('pinch leaves IDLE in pan mode', (await gesture()).state, 'IDLE')

// ── Dead zone: a spawn released over the mode toggle must not create a body ─
await setMode('spawn')
{
  const before = await count()
  const b = await box('Pan mode')
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }])
  await touch('touchMove', [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }])
  await frames()
  await touch('touchEnd', [])
  await frames()
  check('no body spawned when released over the mode toggle', await count(), before)
}

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(52)} actual=${r.actual} expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
const failed = results.filter(r => !r.pass).length
console.log(`${results.length - failed}/${results.length} passed`)
await browser.close()
