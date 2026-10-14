import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:4190'
const width = Number(process.argv[3] || 1440)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height: 800 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

let pass = 0, fail = 0
function check(name, actual, expected) {
  const ok = actual === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(55)} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (ok) pass++; else fail++
}

const tutorialLabel = () => page.locator('[aria-label="Tutorial"]')
const stepText = async () => (await tutorialLabel().locator('.uppercase').first().textContent())?.trim()

// Force-start (no stored skip/complete), full width run-through.
await page.goto(`${url}?tutorial=1`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

check(`[${width}px] tutorial auto-starts`, await tutorialLabel().count() > 0, true)

// Step 0: welcome
await page.getByRole('button', { name: 'Start tutorial' }).click()
await page.waitForTimeout(200)
check(`[${width}px] step 1 (star) reached`, await stepText(), 'Step 1 of 8')

// Step 1: place a star
await page.locator('[data-tutorial="star-tool"]').click()
await page.waitForTimeout(100)
await page.locator('canvas').click({ position: { x: 150, y: 300 } })
await page.waitForTimeout(200)
check(`[${width}px] step 2 (orbit) reached`, await stepText(), 'Step 2 of 8')

// Step 2: two tap-launches (no drag) to reach "Show me", then use it
await page.locator('[data-tutorial="planet-tool"]').click()
await page.waitForTimeout(100)
await page.locator('canvas').click({ position: { x: 250, y: 300 } })
await page.waitForTimeout(150)
await page.locator('canvas').click({ position: { x: 250, y: 300 } })
await page.waitForTimeout(150)
const showMe = page.getByRole('button', { name: 'Show me' })
check(`[${width}px] "Show me" offered after 2 tap-launches`, await showMe.count() > 0, true)
await showMe.click()
await page.waitForTimeout(200)
check(`[${width}px] step 3 (control time) reached`, await stepText(), 'Step 3 of 8')

// Step 3: rewind briefly (rewindUsed fires on press)
const rewindBtn = page.locator('[data-tutorial="rewind"]')
await rewindBtn.dispatchEvent('pointerdown', { pointerId: 1 })
await page.waitForTimeout(100)
await rewindBtn.dispatchEvent('pointerup', { pointerId: 1 })
await page.waitForTimeout(200)
check(`[${width}px] step 4 (move around) reached`, await stepText(), 'Step 4 of 8')

// Step 4: zoom to move the camera
await page.getByTitle('Zoom in').click()
await page.waitForTimeout(400)
check(`[${width}px] step 5 (black hole) reached`, await stepText(), 'Step 5 of 8')

// Step 5: allows manual Next, skipping without ever picking the black-hole
// tool — the body-type sheet the step auto-opened is still up afterwards
// (nothing closes it on a step transition). Escape can't clear it: while the
// tutorial is active, Escape is wired to Skip (it unwinds the tutorial itself
// first, ahead of any sheet it opened) — so close it via its own backdrop
// instead, same as a player tapping outside the sheet would.
await page.getByRole('button', { name: 'Next' }).click()
await page.waitForTimeout(200)
// The backdrop ("Close Body type") spans the whole screen, same as the
// tutorial card's own full-screen dim layer above it — close via the sheet's
// own small × button instead, which the card deliberately dodges.
await page.getByRole('button', { name: 'Close sheet' }).click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(200)
check(`[${width}px] step 6 (presets) reached`, await stepText(), 'Step 6 of 8')

// Step 6: load a preset
await page.locator('[data-tutorial="presets"]').click()
await page.waitForTimeout(100)
await page.getByRole('button', { name: /Binary Stars/ }).first().click()
await page.waitForTimeout(200)
check(`[${width}px] step 7 (share) reached`, await stepText(), 'Step 7 of 8')

// Step 7 (new): settings sheet should auto-open with Share spotlighted
check(`[${width}px] settings sheet auto-opened for the share step`, await page.locator('[data-tutorial="share"]').count() > 0, true)
await page.locator('[data-tutorial="share"]').click()
await page.waitForTimeout(300)
check(`[${width}px] "You're ready" closing card shown after sharing`, await page.getByText("You're ready.").count() > 0, true)

// Step 8: finish
await page.getByRole('button', { name: 'Start playing' }).click()
await page.waitForTimeout(200)
check(`[${width}px] tutorial overlay closes`, await tutorialLabel().count(), 0)

const storedState = await page.evaluate(() => localStorage.getItem('nbody.tutorial.v1'))
check(`[${width}px] tutorial marked completed in storage`, storedState, 'completed')

const { scrollWidth, clientWidth } = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
check(`[${width}px] no horizontal overflow after the full run`, scrollWidth <= clientWidth, true)
check(`[${width}px] no console errors across the full run`, errors.length, 0)

console.log(`\n${pass}/${pass + fail} passed`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
