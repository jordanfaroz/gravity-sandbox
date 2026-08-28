// 3b-1 interaction coverage: the single-pointer paths the pixel harness does not
// exercise — spawn commit, toolbar dead-zone, click-to-edit, body grab, right-click
// delete, double-click follow — plus an explicit measurement of the pointer-capture
// behaviour change.
//
// These are outcome assertions against expected behaviour, not before/after hashes.

import { chromium } from 'playwright'

const [url] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

const frames = () => page.evaluate(
  () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
)
const count = async () =>
  Number((await page.locator('text=/\\d+ bodies/').first().innerText()).match(/(\d+)/)[1])
const editorOpen = () => page.locator('text=Name').first().isVisible().catch(() => false)
const followBadge = () => page.locator('text=/Following/').first().isVisible().catch(() => false)

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await frames()

const results = []
const check = (name, actual, expected) =>
  results.push({ name, actual, expected, pass: actual === expected })

// Solar System at 1.11x: sun at world (0,0) -> screen centre (640,400).
const SUN = { x: 640, y: 400 }
const base = await count()
check('preset loaded 6 bodies', base, 6)

// A. Spawn: drag on empty space and release on canvas
await page.mouse.move(200, 150)
await page.mouse.down()
await page.mouse.move(260, 190, { steps: 4 })
await page.mouse.up()
await frames()
check('spawn on release', await count(), base + 1)

// B. Toolbar dead-zone: release below height-160 must not spawn.
// Also exercises pointer capture, since the release happens over the toolbar.
const afterA = await count()
await page.mouse.move(200, 150)
await page.mouse.down()
await page.mouse.move(640, 720, { steps: 5 })
await page.mouse.up()
await frames()
check('no spawn when released over toolbar', await count(), afterA)

// C. Click a body without moving -> editor opens
await page.mouse.move(SUN.x, SUN.y)
await page.mouse.down()
await page.mouse.up()
await frames()
check('click body opens editor', await editorOpen(), true)
await page.keyboard.press('Escape')
await frames()
check('escape closes editor', await editorOpen(), false)

// D. Body grab: press on the sun, drag, release. Body should follow the pointer,
// so afterwards the sun is hoverable at the new location and not the old one.
await page.mouse.move(SUN.x, SUN.y)
await page.mouse.down()
await page.mouse.move(SUN.x - 150, SUN.y - 80, { steps: 6 })
await page.mouse.up()
await frames()
const hoverAt = async (x, y) => {
  await page.mouse.move(x, y)
  await frames()
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      d => d.style.position === 'fixed' && d.textContent.includes('Mass:')
    )
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null
  })
}
const movedHit = await hoverAt(SUN.x - 150, SUN.y - 80)
check('grabbed body moved with pointer', /Mass: 1200/.test(movedHit ?? ''), true)
check('body count unchanged by grab', await count(), afterA)

// E. Sim must still be paused after a grab (it was paused before the grab began)
// Paused state now reads off the play/pause control's label ('Play' when paused).
const paused = await page.getByRole('button', { name: 'Play' }).isVisible().catch(() => false)
check('grab did not resume a paused sim', paused, true)

// F. Right-click a body -> deleted
const beforeDel = await count()
await page.mouse.move(SUN.x - 150, SUN.y - 80)
await page.mouse.click(SUN.x - 150, SUN.y - 80, { button: 'right' })
await frames()
check('right-click deletes body', await count(), beforeDel - 1)

// G. Double-click a body -> follow camera engages.
// Target the sun's true screen position: the camera centres on the centre of mass,
// which for this preset sits ~18 world units +x of the sun, so the sun renders left
// of the canvas centre. Aiming at 640 leaves the body editor's panel (drawn at
// screenX+20) able to swallow the second click if React paints between the two —
// pre-existing behaviour, but it makes the assertion racy.
await page.getByRole('button', { name: 'Presets' }).click(); await page.getByRole('button', { name: /Solar System/ }).first().click()
await page.keyboard.press('Escape')
await frames()
await page.mouse.dblclick(620, 400)
await frames()
check('double-click engages follow', await followBadge(), true)
// Phase 4d: handleDoubleClick now closes the editor itself when it engages
// follow, since the editor opening was always an artifact of the first click in
// the double-click sequence, not intended behaviour. Back to a single Escape.
check('double-click does NOT leave the editor open (Phase 4d fix)', await editorOpen(), false)
await page.keyboard.press('Escape')
await frames()
check('single escape releases follow', await followBadge(), false)

// H. Pointer-capture delta: start a drag, move over the toolbar (leaving the
// canvas), come back, and release on canvas. With capture the drag survives.
const beforeCap = await count()
await page.mouse.move(200, 150)
await page.mouse.down()
// 730 is over the toolbar bar itself. 700 falls in a pointer-events-none gap
// between the preset row and the bar, where the pointer is still over the canvas.
await page.mouse.move(640, 730, { steps: 4 })
await page.mouse.move(300, 200, { steps: 4 })   // back onto the canvas
await page.mouse.up()
await frames()
const capSpawned = (await count()) === beforeCap + 1
results.push({
  name: 'MEASURED: drag survives leaving canvas (capture)',
  actual: capSpawned, expected: 'was false pre-3b-1', pass: null,
})

console.log('')
for (const r of results) {
  const tag = r.pass === null ? 'MEASURED' : r.pass ? 'PASS' : 'FAIL'
  console.log(`  ${tag.padEnd(9)} ${r.name.padEnd(46)} actual=${r.actual}  expected=${r.expected}`)
}
console.log('\nconsole errors:', JSON.stringify(errors))
console.log('overall:', results.every(r => r.pass !== false) ? 'ALL ASSERTIONS PASS' : 'FAILURES PRESENT')
await browser.close()
