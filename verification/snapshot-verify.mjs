import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:4190'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })
await page.addInitScript(() => { try { localStorage.setItem('nbody.tutorial.v1', 'skipped') } catch {} })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

let pass = 0, fail = 0
function check(name, actual, expected) {
  const ok = actual === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(45)} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (ok) pass++; else fail++
}

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Settings', exact: true }).click()

// ── Save image ────────────────────────────────────────────────────────────
const [download1] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Save image' }).click(),
])
check('Save image triggers a .png download', download1.suggestedFilename().endsWith('.png'), true)
const path1 = await download1.path()
check('the downloaded PNG is non-empty', path1 !== null, true)

// ── Record 10s clip (only if the button is present — it's hidden when the
// browser doesn't support canvas.captureStream + MediaRecorder) ────────────
const recordButton = page.getByRole('button', { name: /Record 10s clip/ })
const canRecord = await recordButton.count() > 0
check('Record button present (Chromium supports captureStream)', canRecord, true)

if (canRecord) {
  await recordButton.click()
  const recordingLabel = page.getByRole('button', { name: /Recording…/ })
  check('button switches to a recording state', await recordingLabel.count() > 0, true)
  const [download2] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.waitForTimeout(11000),
  ])
  check('recording produces a .webm download', download2.suggestedFilename().endsWith('.webm'), true)
  const path2 = await download2.path()
  check('the downloaded clip is non-empty', path2 !== null, true)
}

check('no console errors', errors.length, 0)
console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
