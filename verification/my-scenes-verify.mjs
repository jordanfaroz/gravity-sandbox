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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (ok) pass++; else fail++
}

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Presets' }).click()

check('starts with no saved scenes', await page.getByText('No saved scenes yet').count(), 1)

// ── Save ─────────────────────────────────────────────────────────────────
await page.getByRole('button', { name: /Solar System/ }).first().click()
await page.getByRole('button', { name: 'Presets' }).click()
await page.getByPlaceholder('Name this scene').fill('My Solar System')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(200)
check('saved scene appears in the list', await page.getByText('My Solar System').count(), 1)
check('saved scene has a thumbnail image', await page.locator('img[alt=""]').count() > 0, true)

// Saved scenes persist in localStorage across a real reload.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Presets' }).click()
check('saved scene survives a reload', await page.getByText('My Solar System').count(), 1)

// ── Load ─────────────────────────────────────────────────────────────────
await page.getByRole('button', { name: 'Binary Stars' }).click()
await page.getByRole('button', { name: 'Presets' }).click()
await page.getByRole('button', { name: 'Load' }).click()
await page.waitForTimeout(300)
const hashAfterLoad = await page.evaluate(() => window.location.hash)
check('loading a saved scene updates the URL hash', hashAfterLoad.length > 1, true)

// ── Delete ───────────────────────────────────────────────────────────────
await page.getByRole('button', { name: 'Presets' }).click()
await page.getByRole('button', { name: /Delete My Solar System/ }).click()
await page.waitForTimeout(200)
check('deleted scene is gone from the list', await page.getByText('My Solar System').count(), 0)
check('empty state returns after deleting the only scene', await page.getByText('No saved scenes yet').count(), 1)

check('no console errors', errors.length, 0)
console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
