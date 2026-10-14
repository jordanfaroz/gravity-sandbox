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

// ── CSP header restricts framing to jordworld.com ────────────────────────────
const res = await page.request.get(url)
const csp = res.headers()['content-security-policy']
check('CSP header is present', typeof csp === 'string', true)
check('CSP restricts frame-ancestors to self + jordworld.com', csp, "frame-ancestors 'self' https://jordworld.com https://*.jordworld.com")

// ── Normal mode: full chrome visible ──────────────────────────────────────────
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
check('normal mode shows the Presets button', await page.getByRole('button', { name: 'Presets' }).count() > 0, true)
check('normal mode shows the Help button', await page.getByRole('button', { name: /Help/ }).count() > 0, true)

// ── Embed mode: minimal chrome only ──────────────────────────────────────────
await page.goto(url + '?embed=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
check('embed mode hides the Presets button', await page.getByRole('button', { name: 'Presets' }).count(), 0)
check('embed mode hides the Settings button', await page.getByRole('button', { name: 'Settings', exact: true }).count(), 0)
check('embed mode hides the Help button', await page.getByRole('button', { name: /Help/ }).count(), 0)
check('embed mode shows Pause', await page.getByRole('button', { name: 'Pause' }).count() > 0, true)
const fullLink = page.getByRole('link', { name: /Open full sandbox/ })
check('embed mode shows "Open full sandbox" link', await fullLink.count() > 0, true)
const href = await fullLink.getAttribute('href')
check('the full-sandbox link does not carry ?embed=1', href.includes('embed'), false)
check('the full-sandbox link opens in a new tab', await fullLink.getAttribute('target'), '_blank')

// Tutorial must not auto-start in embed mode.
check('embed mode does not auto-start the tutorial', await page.locator('[aria-label="Tutorial"]').count(), 0)

// Clicking the canvas still spawns a body (minimal interactivity preserved).
const bodyCount = () => page.evaluate(() => window.__gesture().bodies.length)
const before = await bodyCount()
const canvas = page.locator('canvas')
await canvas.click({ position: { x: 400, y: 300 } })
await page.waitForTimeout(200)
check('clicking the canvas still spawns a body in embed mode', await bodyCount(), before + 1)

check('no console errors', errors.length, 0)
console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
