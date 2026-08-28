// Control for the trajectory test.
//
// The refactor introduces a translation, and translating a float coordinate is not
// exactly invertible, so the new initial state differs from the old by ~1e-14.
// This script perturbs the OLD code by a comparable epsilon and evolves it against
// unperturbed OLD. If a preset amplifies 1e-14 into a large divergence here — where
// no code changed at all — then the same divergence in the refactor test is
// inherent chaos, not a behavioural change.

import { PRESETS as OLD } from './out/presets-old.js'
import { step } from './out/physics.js'

const G = 6.674
const DT = 1
const STEPS = Number(process.argv[2] ?? 600)
const EPS = 1e-13

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

console.log(`\nCONTROL: unperturbed OLD vs OLD perturbed by ${EPS}, ${STEPS} steps\n`)
console.log('preset      bodies   max|Δpos|    max|Δvel|   note')
console.log('-'.repeat(70))

for (const name of Object.keys(OLD)) {
  let a = withSeed(() => OLD[name](1280, 800, G))
  let b = withSeed(() => OLD[name](1280, 800, G))
  for (const body of b) { body.x += EPS; body.y += EPS }

  let worstPos = 0, worstVel = 0, note = ''
  for (let s = 0; s < STEPS; s++) {
    a = step(a, G, DT).bodies
    b = step(b, G, DT).bodies
    if (a.length !== b.length) { note = `body count ${a.length} vs ${b.length} at step ${s}`; break }
    for (let i = 0; i < a.length; i++) {
      worstPos = Math.max(worstPos, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y))
      worstVel = Math.max(worstVel, Math.abs(a[i].vx - b[i].vx), Math.abs(a[i].vy - b[i].vy))
    }
  }
  const f = (v) => (v === 0 ? '0' : v.toExponential(2))
  console.log(`${name.padEnd(11)} ${String(a.length).padStart(5)}  ${f(worstPos).padStart(11)}  ${f(worstVel).padStart(11)}   ${note}`)
}
