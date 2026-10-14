import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:4190'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
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

// ── 1280px (this suite's existing "desktop" test width) must NOT get the
// panel — every pre-existing harness assumes the mobile bottom bar there. ──
{
  const narrowerPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await narrowerPage.addInitScript(() => { try { localStorage.setItem('nbody.tutorial.v1', 'skipped') } catch {} })
  await narrowerPage.goto(url, { waitUntil: 'networkidle' })
  await narrowerPage.waitForTimeout(500)
  check('1280px still shows the mobile bottom bar (Presets button)', await narrowerPage.getByRole('button', { name: 'Presets' }).count() > 0, true)
  check('1280px has no desktop panel', await narrowerPage.locator('[data-control-layer="right"]').count(), 0)
  await narrowerPage.close()
}

// ── 1440px gets the panel, expanded by default ───────────────────────────────
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const panel = () => page.locator('[data-control-layer="right"]')
check('1440px shows the desktop panel', await panel().count() > 0, true)
check('panel is expanded by default (no stored preference)', await page.getByText('Controls').count() > 0, true)
check('mobile bottom bar is gone', await page.getByRole('button', { name: 'Presets', exact: true }).count(), 0)
check('presets are inline, not behind a toggle', await page.getByText('Binary Stars').count() > 0, true)

// ── Collapse via the toggle button, persisted to localStorage ───────────────
await page.getByRole('button', { name: 'Collapse panel' }).click()
await page.waitForTimeout(200)
check('panel collapses (Controls header hidden)', await page.getByText('Controls').count(), 0)
check('collapse toggle (‹) still reachable, not hidden behind Help', await page.getByRole('button', { name: 'Expand panel' }).count() > 0, true)
check('collapsed state persisted to localStorage', await page.evaluate(() => localStorage.getItem('nbody.panelCollapsed')), '1')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)
check('collapsed state survives a reload', await page.getByText('Controls').count(), 0)

// ── Expand again via the [ shortcut ──────────────────────────────────────────
await page.keyboard.press('[')
await page.waitForTimeout(200)
check('[ shortcut expands the panel', await page.getByText('Controls').count() > 0, true)
check('expanded state persisted to localStorage', await page.evaluate(() => localStorage.getItem('nbody.panelCollapsed')), '0')

await page.keyboard.press('[')
await page.waitForTimeout(200)
check('[ shortcut collapses it again', await page.getByText('Controls').count(), 0)

// ── Panel controls are functionally equivalent: placing a star works ────────
await page.keyboard.press('[')
await page.waitForTimeout(200)
await page.locator('[data-tutorial="star-tool"]').click()
await page.waitForTimeout(100)
const before = await page.evaluate(() => window.__gesture().bodies.length)
await page.locator('canvas').click({ position: { x: 300, y: 300 } })
await page.waitForTimeout(200)
check('clicking a body type in the panel + canvas still spawns', await page.evaluate(() => window.__gesture().bodies.length), before + 1)

// ── The top-right cluster never sits on top of the panel ─────────────────────
const helpBox = await page.getByRole('button', { name: /Help/ }).boundingBox()
const panelBox = await panel().boundingBox()
check('Help button does not overlap the expanded panel', helpBox.x + helpBox.width <= panelBox.x + 1, true)

check('no console errors', errors.length, 0)
console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
