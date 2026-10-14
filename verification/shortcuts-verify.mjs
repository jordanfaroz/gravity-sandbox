import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:4190'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.addInitScript(() => { try { localStorage.setItem('nbody.tutorial.v1', 'skipped') } catch {} })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

let pass = 0, fail = 0
function check(name, actual, expected) {
  const ok = actual === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(55)} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (ok) pass++; else fail++
}

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

const isPaused = () => page.getByRole('button', { name: 'Play' }).count().then(c => c > 0)

// ── Space pauses/resumes ─────────────────────────────────────────────────────
check('starts running (shows Pause)', await page.getByRole('button', { name: 'Pause' }).count() > 0, true)
await page.keyboard.press(' ')
await page.waitForTimeout(100)
check('space pauses the sim', await isPaused(), true)
await page.keyboard.press(' ')
await page.waitForTimeout(100)
check('space resumes the sim', await page.getByRole('button', { name: 'Pause' }).count() > 0, true)

// ── +/- adjust speed ──────────────────────────────────────────────────────────
// The sheet's backdrop sits over the toolbar, so closing it again means
// Escape (as sheet-verify.mjs also does) — a second click on the toggle
// button never reaches it.
await page.getByRole('button', { name: 'Settings', exact: true }).click()
const before = await page.locator('input[aria-label="Speed"]').inputValue()
await page.keyboard.press('Escape')
await page.waitForTimeout(100)
await page.keyboard.press('+')
await page.waitForTimeout(100)
await page.getByRole('button', { name: 'Settings', exact: true }).click()
const afterPlus = await page.locator('input[aria-label="Speed"]').inputValue()
check('+ increases speed', Number(afterPlus) > Number(before), true)
await page.keyboard.press('Escape')
await page.waitForTimeout(100)
await page.keyboard.press('-')
await page.keyboard.press('-')
await page.waitForTimeout(100)
await page.getByRole('button', { name: 'Settings', exact: true }).click()
const afterMinus = await page.locator('input[aria-label="Speed"]').inputValue()
check('- decreases speed', Number(afterMinus) < Number(afterPlus), true)
await page.keyboard.press('Escape')

// ── F toggles fullscreen (state surfaced via document.fullscreenElement) ────
await page.keyboard.press('f')
await page.waitForTimeout(200)
const fsAfterF = await page.evaluate(() => !!document.fullscreenElement)
// Headless Chromium often refuses real fullscreen; accept either an actual
// transition or a same no-op, but the call must not throw / error.
check('F shortcut does not throw', errors.filter(e => e.includes('Fullscreen')).length, 0)
void fsAfterF

// ── ? opens the help/shortcuts overlay ───────────────────────────────────────
await page.keyboard.press('?')
await page.waitForTimeout(200)
check('? opens the help overlay', await page.getByText('All Controls').count() > 0, true)
await page.keyboard.press('Escape')

// ── Shortcuts do not fire while typing in the "name this scene" field ───────
await page.getByRole('button', { name: 'Presets' }).click()
await page.getByPlaceholder('Name this scene').click()
await page.getByPlaceholder('Name this scene').fill('f r + - ?')
await page.waitForTimeout(100)
check('typing f/r/+/-/? in a field does not pause the sim', await page.getByRole('button', { name: 'Pause' }).count() > 0, true)
check('typed text is preserved, not intercepted', await page.getByPlaceholder('Name this scene').inputValue(), 'f r + - ?')

check('no console errors', errors.length, 0)
console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
