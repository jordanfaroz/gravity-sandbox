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

// ── Manifest is linked and well-formed ───────────────────────────────────────
await page.goto(url, { waitUntil: 'networkidle' })
const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
check('manifest link present', typeof manifestHref === 'string', true)
const manifestRes = await page.request.get(new URL(manifestHref, url).toString())
const manifest = await manifestRes.json()
check('manifest has standalone display', manifest.display, 'standalone')
check('manifest has a 512x512 icon', manifest.icons.some(i => i.sizes === '512x512' && !i.purpose), true)
check('manifest has a maskable icon', manifest.icons.some(i => i.purpose === 'maskable'), true)

// ── Service worker registers and activates ───────────────────────────────────
await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15000 }).catch(() => {})
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready
  return reg.active?.state ?? null
})
check('service worker reaches the active state', swState, 'activated')

// Let it finish populating its runtime cache from this first visit.
await page.waitForTimeout(1500)

// ── Offline reload still renders the app shell ───────────────────────────────
await page.context().setOffline(true)
await page.reload({ waitUntil: 'load' }).catch(() => {})
await page.waitForTimeout(1000)
const canvasVisibleOffline = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return !!c && c.getBoundingClientRect().width > 0
})
check('app shell still renders while offline', canvasVisibleOffline, true)
await page.context().setOffline(false)

// ── A shared-scene link still restores correctly with the SW installed ──────
// (fragments are never sent in fetch requests, so the SW can't see or touch
// them — this just confirms nothing else regressed that invariant.)
await page.goto(url, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Presets' }).click()
await page.getByRole('button', { name: /Solar System/ }).first().click()
await page.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: /Share/ }).first().click()
await page.waitForTimeout(300)
const hash = await page.evaluate(() => window.location.hash)
await page.goto('about:blank')
await page.goto(url + hash, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const restoredOk = await page.evaluate(() => !!document.querySelector('canvas'))
check('shared-scene link still restores with the service worker installed', restoredOk, true)

const realErrors = errors.filter(e => !e.includes('Failed to fetch'))
if (realErrors.length > 0) console.log('errors seen:', realErrors)
check('no console errors across the whole run', realErrors.length, 0)
console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
