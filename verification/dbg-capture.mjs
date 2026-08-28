// Does the canvas still receive leave events while a pointer is captured?
// The pre-3b-1 code cancelled any in-progress drag in its mouseleave handler, so
// whether that handler still fires during a press determines whether the capture
// change alters behaviour.
import { chromium } from 'playwright'
const [url] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.evaluate(() => {
  window.__ev = []
  const c = document.querySelector('canvas')
  for (const t of ['mouseleave', 'pointerleave', 'pointerout', 'lostpointercapture']) {
    c.addEventListener(t, () => window.__ev.push(t))
  }
})

// Case 1: move onto the toolbar overlay with NO button held.
await page.mouse.move(300, 200)
await page.mouse.move(640, 730, { steps: 4 })
await frames()
console.log('no button held, canvas -> toolbar :', JSON.stringify(await page.evaluate(() => window.__ev)))

// Case 2: same movement, but with a captured pointer down.
await page.evaluate(() => { window.__ev = [] })
await page.mouse.move(300, 200)
await page.mouse.down()
await page.mouse.move(640, 730, { steps: 4 })
await frames()
console.log('button held (captured), canvas -> toolbar :', JSON.stringify(await page.evaluate(() => window.__ev)))
await page.mouse.up()
await frames()
console.log('after release                            :', JSON.stringify(await page.evaluate(() => window.__ev)))

await browser.close()
