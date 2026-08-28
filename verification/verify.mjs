import { chromium } from 'playwright'

const url = process.argv[2]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return { found: false }
  return { found: true, w: c.width, h: c.height }
})

// Load a preset (Solar System) so there are bodies to simulate
await page.getByRole('button', { name: 'Solar System' }).click()
await page.waitForTimeout(300)

// Sample canvas pixels at two points in time to prove the sim is animating
const sample = async () => page.evaluate(() => {
  const c = document.querySelector('canvas')
  const ctx = c.getContext('2d')
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let nonBg = 0, sum = 0
  for (let i = 0; i < d.length; i += 4 * 97) {
    const r = d[i], g = d[i+1], b = d[i+2]
    sum += r + g + b
    if (r > 20 || g > 20 || b > 26) nonBg++
  }
  return { nonBg, sum }
})

const a = await sample()
await page.waitForTimeout(1200)
const b = await sample()

const bodyCount = await page.evaluate(() =>
  document.body.innerText.match(/(\d+)\s+bodies/)?.[1] ?? null
)

console.log(JSON.stringify({
  canvas: canvasInfo,
  litPixelsBefore: a.nonBg,
  litPixelsAfter: b.nonBg,
  frameChanged: a.sum !== b.sum,
  bodyCount,
  errors,
}, null, 2))

await page.screenshot({ path: process.argv[3] })
await browser.close()
