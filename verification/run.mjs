// Phase 3a-2 verification: trajectory identity between the old canvas-relative
// presets and the new fixed-world-unit presets.
//
// The new layout is the old 1280x800 layout translated by (-640, -400), so old
// positions are compared after subtracting that offset. Velocities are compared
// directly — a translation must not change them at all.
//
// 6 of the 11 presets call Math.random(), so it is replaced with a seeded PRNG
// that is re-seeded identically before each generation. Any difference in how
// many times a preset draws from it would show up immediately as a huge divergence.

import { PRESETS as OLD } from './out/presets-old.js'
import { PRESETS as NEW } from './out/presets-new.js'
import { step } from './out/physics.js'

const G = 6.674
const DT = 1
const STEPS = Number(process.argv[2] ?? 600)
const OFFSET_X = 640   // old cx at w=1280
const OFFSET_Y = 400   // old cy at h=800

// Deterministic PRNG (mulberry32)
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const realRandom = Math.random
const withSeed = (fn) => {
  Math.random = seeded(12345)
  try { return fn() } finally { Math.random = realRandom }
}

const names = Object.keys(NEW)
const rows = []

for (const name of names) {
  const oldBodies = withSeed(() => OLD[name](1280, 800, G))
  const newBodies = withSeed(() => NEW[name](G))

  if (oldBodies.length !== newBodies.length) {
    rows.push({ name, status: 'BODY COUNT MISMATCH', old: oldBodies.length, new: newBodies.length })
    continue
  }

  const measure = () => {
    let maxPos = 0, maxVel = 0
    for (let i = 0; i < newBodies.length; i++) {
      const o = oldBodies[i], n = newBodies[i]
      maxPos = Math.max(maxPos,
        Math.abs((o.x - OFFSET_X) - n.x),
        Math.abs((o.y - OFFSET_Y) - n.y))
      maxVel = Math.max(maxVel, Math.abs(o.vx - n.vx), Math.abs(o.vy - n.vy))
    }
    return { maxPos, maxVel }
  }

  const initial = measure()

  let oa = oldBodies, nb = newBodies
  let worstPos = initial.maxPos, worstVel = initial.maxVel
  for (let s = 0; s < STEPS; s++) {
    oa = step(oa, G, DT).bodies
    nb = step(nb, G, DT).bodies
    if (oa.length !== nb.length) {
      rows.push({ name, status: `DIVERGED: body count ${oa.length} vs ${nb.length} at step ${s}` })
      oa = null
      break
    }
    for (let i = 0; i < nb.length; i++) {
      const o = oa[i], n = nb[i]
      worstPos = Math.max(worstPos,
        Math.abs((o.x - OFFSET_X) - n.x),
        Math.abs((o.y - OFFSET_Y) - n.y))
      worstVel = Math.max(worstVel, Math.abs(o.vx - n.vx), Math.abs(o.vy - n.vy))
    }
  }
  if (oa === null) continue

  rows.push({
    name,
    bodies: newBodies.length,
    initialMaxPos: initial.maxPos,
    initialMaxVel: initial.maxVel,
    maxPosDiv: worstPos,
    maxVelDiv: worstVel,
  })
}

const fmt = (v) => (v === 0 ? '0' : v.toExponential(2))
console.log(`\nSteps per preset: ${STEPS}, dt=${DT}, G=${G}\n`)
console.log('preset      bodies  initial|Δpos|  initial|Δvel|   max|Δpos|   max|Δvel|')
console.log('-'.repeat(76))
let worst = 0
for (const r of rows) {
  if (r.status) { console.log(`${r.name.padEnd(11)} ${r.status}`); worst = Infinity; continue }
  console.log(
    `${r.name.padEnd(11)} ${String(r.bodies).padStart(5)}   ${fmt(r.initialMaxPos).padStart(11)}  ${fmt(r.initialMaxVel).padStart(12)}  ${fmt(r.maxPosDiv).padStart(11)}  ${fmt(r.maxVelDiv).padStart(11)}`
  )
  worst = Math.max(worst, r.maxPosDiv, r.maxVelDiv)
}
console.log('-'.repeat(76))
console.log(`worst divergence across all presets: ${fmt(worst)}`)
