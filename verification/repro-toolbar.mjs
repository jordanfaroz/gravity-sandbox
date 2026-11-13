// Reproduction harness for the "bottom toolbar not visible on some phones" bug.
// Screenshots + an on-screen assertion across the requested device matrix,
// portrait and landscape, plus a "browser chrome expanded" proxy (a shorter
// explicit viewport, standing in for the shrunk visual viewport a real
// mobile browser's address bar produces — see the note below for why this
// is the honest limit of what headless Chromium can reproduce).

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] || 'http://localhost:4190'
const outDir = process.argv[3] || '/tmp/toolbar-repro'
mkdirSync(outDir, { recursive: true })

const PROFILES = [
  { label: 'iphone-se', width: 375, height: 667 },
  { label: 'iphone-12-14', width: 390, height: 844 },
  { label: 'iphone-15-pro-max', width: 430, height: 932 },
  { label: 'small-android', width: 360, height: 640 },
  { label: 'pixel-7', width: 412, height: 915 },
]

const browser = await chromium.launch()
const results = []

async function checkBar(page, label) {
  return page.evaluate((label) => {
    const layer = document.querySelector('[data-control-layer="bottom"]')
    if (!layer) return { label, found: false }
    const r = layer.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const presets = document.querySelector('[data-control="presets"]')
    const pr = presets?.getBoundingClientRect()
    const fullyVisible = r.top >= 0 && r.left >= 0 && r.right <= vw + 1 && r.bottom <= vh + 1 && r.width > 0 && r.height > 0
    const presetsVisible = !!pr && pr.top >= 0 && pr.bottom <= vh + 1 && pr.width >= 44 && pr.height >= 44
    return {
      label, found: true, fullyVisible, presetsVisible,
      rect: { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) },
      viewport: { vw, vh },
      presetRect: pr ? { top: Math.round(pr.top), bottom: Math.round(pr.bottom), w: Math.round(pr.width), h: Math.round(pr.height) } : null,
    }
  }, label)
}

async function run(label, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.addInitScript(() => { try { localStorage.setItem('nbody.tutorial.v1', 'skipped') } catch {} })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const res = await checkBar(page, label)
  results.push(res)
  await page.screenshot({ path: `${outDir}/${label}.png` })
  console.log(`${res.found && res.fullyVisible && res.presetsVisible ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} ${JSON.stringify(res)}`)
  await context.close()
}

for (const p of PROFILES) {
  await run(`${p.label}-portrait-${p.width}x${p.height}`, p.width, p.height)
  await run(`${p.label}-landscape-${p.height}x${p.width}`, p.height, p.width)
}

// Browser-chrome-expanded proxy: same widths, shorter heights (a realistic
// ~107-140px toolbar+tab-strip allowance), representing the visible area
// once the address bar is showing. This is a PROXY, not a true repro — see
// README note added alongside this script for why desktop Chromium cannot
// make window.innerHeight/visualViewport diverge from the CSS vh unit the
// way real mobile Safari/Chrome does when toggling their own chrome.
await run('chrome-expanded-se-390x560', 390, 560)
await run('chrome-expanded-pixel7-412x700', 412, 700)

console.log(`\nscreenshots in ${outDir}`)
await browser.close()
const failed = results.filter(r => !r.found || !r.fullyVisible || !r.presetsVisible).length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(0)
