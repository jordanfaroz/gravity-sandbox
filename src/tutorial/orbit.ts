/**
 * Pure orbit-classification math for tutorial step 2. No DOM, no refs — takes
 * plain numbers so it's directly unit-testable (see verification/tutorial-verify.ts).
 *
 * Positions/velocities are relative (planet minus star), so a moving or pinned
 * star both work without special-casing.
 */
export interface RelativeSample {
  dx: number
  dy: number
  dvx: number
  dvy: number
}

/** Below this launch speed (world units/frame), treat a "throw" as a tap. */
export const TAP_LAUNCH_SPEED = 0.3

/** One full orbit's worth of swept angle, radians. */
export const FULL_ORBIT_RADIANS = 2 * Math.PI

/** Step 2 succeeds at a full orbit OR this many ms of continued bound flight. */
export const ORBIT_SUCCESS_MS = 6000

export function launchSpeed(vx: number, vy: number): number {
  return Math.hypot(vx, vy)
}

export function isTapLaunch(vx: number, vy: number): boolean {
  return launchSpeed(vx, vy) < TAP_LAUNCH_SPEED
}

/** Specific orbital energy: v²/2 − GM/r. Negative means gravitationally bound. */
export function orbitalEnergy(s: RelativeSample, G: number, starMass: number): number {
  const r = Math.hypot(s.dx, s.dy)
  const v2 = s.dvx * s.dvx + s.dvy * s.dvy
  return v2 / 2 - (G * starMass) / r
}

export function isBound(s: RelativeSample, G: number, starMass: number): boolean {
  return orbitalEnergy(s, G, starMass) < 0
}

/** Unbound AND still moving away from the star, not just momentarily unbound. */
export function isEscaping(s: RelativeSample, G: number, starMass: number): boolean {
  const r = Math.hypot(s.dx, s.dy)
  if (r === 0) return false
  const radialSpeed = (s.dx * s.dvx + s.dy * s.dvy) / r
  return orbitalEnergy(s, G, starMass) >= 0 && radialSpeed > 0
}

export function circularOrbitSpeed(G: number, starMass: number, r: number): number {
  return Math.sqrt((G * starMass) / r)
}

/** Wrap an angle delta to (-π, π], so a full revolution doesn't cancel itself out. */
export function normalizeAngleDelta(delta: number): number {
  let d = delta % FULL_ORBIT_RADIANS
  if (d <= -Math.PI) d += FULL_ORBIT_RADIANS
  if (d > Math.PI) d -= FULL_ORBIT_RADIANS
  return d
}

export interface OrbitWatchState {
  lastAngle: number | null
  sweptRadians: number
  elapsedMs: number
}

export const initialOrbitWatch: OrbitWatchState = { lastAngle: null, sweptRadians: 0, elapsedMs: 0 }

export type OrbitSampleResult =
  | { status: 'watching'; state: OrbitWatchState }
  | { status: 'success' }
  | { status: 'escaped' }

/**
 * Advance the watch by one physics step. Called only while the sim is actually
 * stepping (not paused, not rewinding), so elapsedMs tracks sim time, not wall time.
 */
export function sampleOrbit(
  state: OrbitWatchState,
  sample: RelativeSample,
  G: number,
  starMass: number,
  dtMs: number
): OrbitSampleResult {
  if (isEscaping(sample, G, starMass)) return { status: 'escaped' }

  const angle = Math.atan2(sample.dy, sample.dx)
  const sweptRadians =
    state.sweptRadians + (state.lastAngle === null ? 0 : Math.abs(normalizeAngleDelta(angle - state.lastAngle)))
  const elapsedMs = state.elapsedMs + dtMs

  if (sweptRadians >= FULL_ORBIT_RADIANS || elapsedMs >= ORBIT_SUCCESS_MS) {
    return { status: 'success' }
  }
  return { status: 'watching', state: { lastAngle: angle, sweptRadians, elapsedMs } }
}
