import { chromium } from 'playwright'
const [url] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

// log which DOM events actually reach the canvas
await page.evaluate(() => {
  window.__log = []
  const c = document.querySelector('canvas')
  for (const t of ['pointerdown', 'pointerup', 'click', 'dblclick', 'pointercancel']) {
    c.addEventListener(t, e => window.__log.push(`${t}(btn=${e.button},detail=${e.detail ?? '-'})`))
  }
})

await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Solar System', exact: true }).click()
await frames()

const badge = () => page.locator('text=/Following/').first().isVisible().catch(() => false)

for (const [label, x, y] of [['sun-exact', 620, 400], ['sun-offset', 640, 400]]) {
  await page.evaluate(() => { window.__log = [] })
  await page.keyboard.press('Escape')
  await frames()
  await page.mouse.dblclick(x, y)
  await frames()
  const log = await page.evaluate(() => window.__log)
  console.log(`${label} @(${x},${y}) -> following=${await badge()}`)
  console.log('   events:', log.join(' '))
  await page.keyboard.press('Escape')
  await frames()
}
await browser.close()
