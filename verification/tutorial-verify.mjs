// Phase: onboarding tutorial. Pure-logic unit tests for the step state machine
// and the orbit-classification math — no DOM, no Playwright, no build step.
// Run directly: node verification/tutorial-verify.mjs
//
// Plain .mjs, matching every other script in this directory — NOT .ts: Next's
// own typecheck sweeps up **/*.ts project-wide, which rejects the explicit
// ".ts" extensions Node's ESM loader requires on relative imports. The actual
// logic under test still lives in src/tutorial/*.ts; Node's native type
// stripping (23.6+) handles those imports transparently regardless of this
// file's own extension.

import { reduceTutorial, initialTutorialState, LAST_STEP, ORBIT_STEP, MAX_ORBIT_ATTEMPTS_BEFORE_SHOW_ME }
  from '../src/tutorial/state-machine.ts'
import { shouldAutoStart } from '../src/tutorial/storage.ts'
import {
  orbitalEnergy, isBound, isEscaping, isTapLaunch, circularOrbitSpeed, normalizeAngleDelta,
  sampleOrbit, initialOrbitWatch,
} from '../src/tutorial/orbit.ts'

const results = []
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  results.push({ name, pass: a === e, actual: a, expected: e })
}

// ── State machine: advance on events ──────────────────────────────────────
{
  let s = reduceTutorial(initialTutorialState, { type: 'START' })
  check('START activates at step 0', { active: s.active, step: s.stepIndex }, { active: true, step: 0 })

  s = reduceTutorial(s, { type: 'ADVANCE' })
  check('ADVANCE from 0 -> 1', s.stepIndex, 1)

  for (let i = 1; i < LAST_STEP; i++) s = reduceTutorial(s, { type: 'ADVANCE' })
  check('ADVANCE repeatedly reaches the last step', s.stepIndex, LAST_STEP)
  check('still active at the last step', s.active, true)

  s = reduceTutorial(s, { type: 'ADVANCE' })
  check('ADVANCE past the last step deactivates', s.active, false)
}

// ── State machine: back ────────────────────────────────────────────────────
{
  let s = reduceTutorial(initialTutorialState, { type: 'START' })
  s = reduceTutorial(s, { type: 'ADVANCE' })
  s = reduceTutorial(s, { type: 'ADVANCE' })
  check('two ADVANCEs reach step 2', s.stepIndex, 2)

  s = reduceTutorial(s, { type: 'BACK' })
  check('BACK goes to step 1', s.stepIndex, 1)

  s = reduceTutorial(s, { type: 'BACK' })
  check('BACK from step 1 goes to step 0', s.stepIndex, 0)

  const atZero = reduceTutorial(s, { type: 'BACK' })
  check('BACK at step 0 is a no-op', atZero.stepIndex, 0)

  const inactive = reduceTutorial(initialTutorialState, { type: 'BACK' })
  check('BACK while inactive is a no-op', inactive, initialTutorialState)
}

// ── State machine: skip ────────────────────────────────────────────────────
{
  let s = reduceTutorial(initialTutorialState, { type: 'START' })
  s = reduceTutorial(s, { type: 'ADVANCE' })
  s = reduceTutorial(s, { type: 'SKIP' })
  check('SKIP deactivates regardless of step', s.active, false)
}

// ── State machine: orbit failure / show-me gate ────────────────────────────
{
  let s = initialTutorialState
  s = reduceTutorial(s, { type: 'START' })
  for (let i = 0; i < ORBIT_STEP; i++) s = reduceTutorial(s, { type: 'ADVANCE' })
  check('reached the orbit step', s.stepIndex, ORBIT_STEP)

  check(
    'ORBIT_FAIL outside the orbit step is a no-op',
    reduceTutorial(initialTutorialState, { type: 'ORBIT_FAIL', reason: 'tap' }),
    initialTutorialState
  )

  s = reduceTutorial(s, { type: 'ORBIT_FAIL', reason: 'tap' })
  check('1st failure: hint set, no show-me yet', { hint: s.orbitHint, showMe: s.showMeOffered }, { hint: 'tap', showMe: false })

  s = reduceTutorial(s, { type: 'ORBIT_FAIL', reason: 'escaped' })
  check(`${MAX_ORBIT_ATTEMPTS_BEFORE_SHOW_ME}nd failure offers Show Me`, s.showMeOffered, true)
  check('still on the orbit step after failures', s.stepIndex, ORBIT_STEP)

  s = reduceTutorial(s, { type: 'SHOW_ME_USED' })
  check('SHOW_ME_USED advances past the orbit step', s.stepIndex, ORBIT_STEP + 1)
  check('SHOW_ME_USED clears the hint/attempts', { hint: s.orbitHint, attempts: s.orbitAttempts }, { hint: null, attempts: 0 })
}

// ── Persistence / version-key policy (pure) ────────────────────────────────
{
  check('no stored value, not forced -> auto-start', shouldAutoStart(null, false), true)
  check('completed, not forced -> no auto-start', shouldAutoStart('completed', false), false)
  check('skipped, not forced -> no auto-start', shouldAutoStart('skipped', false), false)
  check('completed, but ?tutorial=1 -> forced start', shouldAutoStart('completed', true), true)
}

// ── Orbit math: energy / bound / escaping ──────────────────────────────────
{
  const G = 6.674, starMass = 800
  const r = 100
  const vCirc = circularOrbitSpeed(G, starMass, r)

  const circularSample = { dx: r, dy: 0, dvx: 0, dvy: vCirc }
  check('circular-speed orbit is bound', isBound(circularSample, G, starMass), true)
  check('circular-speed orbit is not escaping', isEscaping(circularSample, G, starMass), false)

  const fastSample = { dx: r, dy: 0, dvx: vCirc * 5, dvy: 0 }
  check('overspeed + receding is escaping', isEscaping(fastSample, G, starMass), true)
  check('overspeed + receding is not bound', isBound(fastSample, G, starMass), false)

  const inboundUnbound = { dx: r, dy: 0, dvx: -vCirc * 5, dvy: 0 }
  check('unbound but still approaching is not "escaping" yet', isEscaping(inboundUnbound, G, starMass), false)

  check('near-zero launch speed is a tap', isTapLaunch(0.01, 0.01), true)
  check('a real throw is not a tap', isTapLaunch(3, 2), false)

  check(
    'orbitalEnergy is negative for a slow, close orbit',
    orbitalEnergy({ dx: 10, dy: 0, dvx: 0, dvy: 1 }, G, starMass) < 0,
    true
  )
}

// ── Orbit math: angle wraparound ───────────────────────────────────────────
{
  check('small forward step', normalizeAngleDelta(0.1), 0.1)
  check(
    'wraps a step just past +π down to just past -π',
    +normalizeAngleDelta(Math.PI + 0.1).toFixed(5),
    +(-Math.PI + 0.1).toFixed(5)
  )
  check(
    'wraps a step just past -π up to just under +π',
    +normalizeAngleDelta(-Math.PI - 0.1).toFixed(5),
    +(Math.PI - 0.1).toFixed(5)
  )
}

// ── Orbit math: sampleOrbit over a full synthetic orbit ────────────────────
{
  const G = 6.674, starMass = 800, r = 100
  const vCirc = circularOrbitSpeed(G, starMass, r)
  const omega = vCirc / r
  const dtMs = 16.667

  let watch = initialOrbitWatch
  let succeeded = false
  let escapedEarly = false
  let angle = 0
  for (let i = 0; i < 100000; i++) {
    angle += omega * (dtMs / 1000) * 60
    const sample = {
      dx: r * Math.cos(angle), dy: r * Math.sin(angle),
      dvx: -vCirc * Math.sin(angle), dvy: vCirc * Math.cos(angle),
    }
    const result = sampleOrbit(watch, sample, G, starMass, dtMs)
    if (result.status === 'success') { succeeded = true; break }
    if (result.status === 'escaped') { escapedEarly = true; break }
    watch = result.state
  }
  check('a genuine circular orbit eventually reports success', succeeded, true)
  check('a genuine circular orbit never reports escaped', escapedEarly, false)
}

{
  const G = 6.674, starMass = 800
  const vCirc = circularOrbitSpeed(G, starMass, 100)
  let watch = initialOrbitWatch
  let status = 'watching'
  for (let i = 0; i < 1000 && status === 'watching'; i++) {
    const t = i * 16.667
    const sample = { dx: 100 + vCirc * 6 * (t / 1000), dy: 0, dvx: vCirc * 6, dvy: 0 }
    const result = sampleOrbit(watch, sample, G, starMass, 16.667)
    status = result.status
    if (result.status === 'watching') watch = result.state
  }
  check('a fast straight-line departure reports escaped', status, 'escaped')
}

console.log('')
for (const r of results) {
  console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.name.padEnd(62)} actual=${r.actual} expected=${r.expected}`)
}
const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed > 0) process.exit(1)
