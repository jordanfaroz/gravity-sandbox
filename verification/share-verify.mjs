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

// ── 1. Share round trip: set a non-default speed, share, reopen the link ────
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Presets' }).click()
await page.getByRole('button', { name: /Solar System/ }).first().click()

await page.getByRole('button', { name: 'Settings', exact: true }).click()
const speedSlider = page.locator('input[aria-label="Speed"]')
await speedSlider.evaluate(el => {
  // React wraps the instance's own `value` setter to track changes; setting
  // through it directly leaves the tracker in sync, so React sees no change
  // and never fires onChange. Going through the native prototype setter
  // instead makes the dispatched event actually reach the React handler.
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  nativeSetter.call(el, '2.5')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

await page.evaluate(() => { window.location.hash = '' })
await page.getByRole('button', { name: /Share/ }).first().click().catch(() => {})
await page.waitForTimeout(300)
const hash1 = await page.evaluate(() => window.location.hash)
check('share populates the URL hash', hash1.length > 1, true)

// A hash-only URL change on the same document is a same-page navigation (no
// remount), so force a real fresh load the way opening a shared link in a new
// tab would — otherwise this would just be testing the page that already has
// the sheet open, not the mount-time decode effect.
const reloadUrl = url + hash1
await page.goto('about:blank')
await page.goto(reloadUrl, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const bodyCountAfterReload = await page.evaluate(() => document.querySelectorAll('canvas').length)
check('canvas still renders after reopening a shared link', bodyCountAfterReload > 0, true)
check('no console errors after reopening a shared link', errors.length, 0)
await page.getByRole('button', { name: 'Settings', exact: true }).click()
const restoredSpeed = await page.locator('input[aria-label="Speed"]').inputValue()
check('speed round-trips through a shared link', restoredSpeed, '2.5')

// ── 2. Malformed hash must not crash the sim ─────────────────────────────────
const badHashes = [
  '#not-base64-at-all!!!',
  '#' + Buffer.from('not json').toString('base64'),
  '#' + Buffer.from(JSON.stringify({ b: 'not-an-array' })).toString('base64'),
  '#' + Buffer.from(JSON.stringify({ b: [[  'star', NaN, 0, 0, 0, 1, 1, '#fff'  ]] })).toString('base64'),
  '#' + Buffer.from(JSON.stringify({ b: Array.from({ length: 5000 }, () => ['planet', 0, 0, 0, 0, 1, 1, '#fff']) })).toString('base64'),
]
for (const bad of badHashes) {
  errors.length = 0
  await page.goto(url + bad, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const canvasOk = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return !!c && c.width > 0 && c.height > 0
  })
  check(`malformed hash does not crash the page: ${bad.slice(0, 40)}`, canvasOk, true)
  check(`  ...and no console errors`, errors.length, 0)
}

console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
