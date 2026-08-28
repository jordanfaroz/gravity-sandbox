// Phase 3a verification harness — proves the camera-helper extraction is
// pixel-identical on desktop. Run once before the refactor and once after.
//
//   node .camera-verify.mjs <url> <outDir> <label>
//
// Determinism notes:
//  - The sim is PAUSED immediately after loading a preset, so no physics advances.
//  - "Solar System" is used because it contains no black hole; drawBlackHole reads
//    Date.now() for its animated rings and would differ between runs.
//  - The mouse is parked over the toolbar before each capture, which fires the
//    canvas mouseleave and clears any hover ring.

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const [url, outDir, label] = process.argv.slice(2)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('pageerror: ' + e.message))

const frames = () => page.evaluate(
  () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
)

// FNV-1a over every RGBA byte of the canvas backing store.
const canvasHash = () => page.evaluate(() => {
  const c = document.querySelector('canvas')
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let h = 0x811c9dc5
  for (let i = 0; i < d.length; i++) {
    h ^= d[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return { hash: h.toString(16).padStart(8, '0'), w: c.width, h: c.height }
})

const zoomLabel = () => page.locator('[title="Reset view"]').innerText()
const park = async () => { await page.mouse.move(640, 730); await frames() }

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// Pause FIRST, then load. Loading first lets the sim advance by an arbitrary
// wall-clock amount before the pause lands, which makes body positions — and
// therefore every hash — differ between runs.
await page.getByRole('button', { name: /Pause/ }).click()
await page.getByRole('button', { name: 'Solar System' }).click()
await frames()

const resetView = async () => {
  await page.locator('[title="Reset view"]').click()
  await frames()
}
const zoom = async (dir, n) => {
  for (let i = 0; i < n; i++) await page.locator(`[title="Zoom ${dir}"]`).click()
  await frames()
}
const pan = async (fromX, fromY, dx, dy) => {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(fromX + dx, fromY + dy, { steps: 6 })
  await page.mouse.up({ button: 'middle' })
  await frames()
}

const results = {}

const capture = async (name) => {
  await park()
  const { hash, w, h } = await canvasHash()
  results[name] = { hash, canvas: `${w}x${h}`, zoom: await zoomLabel() }
  await page.screenshot({ path: `${outDir}/${label}-${name}.png` })
}

// ── Viewport states ────────────────────────────────────────────────────────
await resetView();              await capture('s1-reset')
await zoom('in', 2);            await capture('s2-zoomin2')
await zoom('in', 2);            await capture('s3-zoomin4')
await resetView(); await zoom('out', 2); await capture('s4-zoomout2')
await resetView(); await pan(300, 200, 220, 130); await capture('s5-pan')
await zoom('in', 2);            await capture('s6-panzoom')

// ── Hit-testing probe ──────────────────────────────────────────────────────
// Black-box: identical canvas coords must report the identical body before and
// after. Tooltip mass+radius uniquely identify each body in this preset.
const probeAt = async (x, y) => {
  await page.mouse.move(x, y)
  await frames()
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      d => d.style.position === 'fixed' && d.textContent.includes('Mass:')
    )
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null
  })
}

const probeGrid = async (stateName) => {
  const hits = []
  // Wide enough that the star's ×2.5 grab radius does not swallow the whole band
  // at high zoom — the outer planets stay reachable at every tested scale.
  for (let x = 500; x <= 1260; x += 20) {
    for (const y of [340, 400, 460]) {
      hits.push(`${x},${y}=${(await probeAt(x, y)) ?? '-'}`)
    }
  }
  results[`probe-${stateName}`] = hits
}

await resetView();               await probeGrid('reset')
await zoom('in', 2);             await probeGrid('zoomin2')
await resetView(); await zoom('out', 2); await probeGrid('zoomout2')

// ── Mid-drag state (last: releasing would spawn a body) ────────────────────
await resetView()
await page.mouse.move(300, 200)
await page.mouse.down()
await page.mouse.move(420, 260, { steps: 5 })
await frames()
{
  const { hash } = await canvasHash()
  results['s7-middrag'] = { hash, zoom: await zoomLabel() }
  await page.screenshot({ path: `${outDir}/${label}-s7-middrag.png` })
}
await page.mouse.up()

results.errors = errors
writeFileSync(`${outDir}/${label}.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))

await browser.close()
