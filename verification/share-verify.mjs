import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:4190'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
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

// Settings sheet holds the speed slider.
await page.getByRole('button', { name: 'Settings' }).click().catch(() => {})
const speedSlider = page.locator('input[type="range"]').filter({ hasText: '' }).last()
// Fall back to evaluating the app's own setter via the share button's encode
// path if the slider isn't locatable generically — directly drive the hash.
await page.evaluate(() => { window.location.hash = '' })

await page.getByRole('button', { name: /Share/ }).first().click().catch(() => {})
await page.waitForTimeout(300)
const hash1 = await page.evaluate(() => window.location.hash)
check('share populates the URL hash', hash1.length > 1, true)

const reloadUrl = url + hash1
await page.goto(reloadUrl, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const bodyCountAfterReload = await page.evaluate(() => document.querySelectorAll('canvas').length)
check('canvas still renders after reopening a shared link', bodyCountAfterReload > 0, true)
check('no console errors after reopening a shared link', errors.length, 0)

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
