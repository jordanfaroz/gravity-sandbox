export type BodyType = 'star' | 'planet' | 'blackhole' | 'asteroid'

export interface Body {
  id: string
  type: BodyType
  x: number
  y: number
  vx: number
  vy: number
  ax: number
  ay: number
  prevAx: number
  prevAy: number
  mass: number
  radius: number
  trail: { x: number; y: number }[]
  color: string
  pinned?: boolean
  name?: string
  imageUrl?: string
}

const SOFTENING_SQ = 50
const TRAIL_LENGTH = 150
const COLLISION_DAMPING = 0.72  // merged body retains 72% of momentum — rest lost as heat/radiation

export function defaultMass(type: BodyType): number {
  switch (type) {
    case 'star': return 800
    case 'planet': return 15
    case 'blackhole': return 4000
    case 'asteroid': return 2
  }
}

export function defaultRadius(mass: number, type: BodyType): number {
  switch (type) {
    case 'star': return Math.max(18, Math.cbrt(mass) * 3.2)
    case 'planet': return Math.max(5, Math.cbrt(mass) * 2.2)
    case 'blackhole': return Math.max(16, Math.cbrt(mass) * 2.0)
    case 'asteroid': return Math.max(2, Math.cbrt(mass) * 1.0)
  }
}

// Hex palette so the renderer can safely append two-digit hex alpha (e.g. 'cc', '44')
const PLANET_COLORS = [
  '#4fa3e0', // sky blue
  '#e8a050', // amber
  '#7ed880', // green
  '#c478e8', // violet
  '#e85c6a', // rose
  '#50d4c0', // teal
  '#e87850', // orange
  '#d4e050', // lime
]
let hueIndex = 0

export function defaultColor(type: BodyType): string {
  switch (type) {
    case 'star': return '#FFD700'
    case 'planet': {
      const color = PLANET_COLORS[hueIndex % PLANET_COLORS.length]
      hueIndex++
      return color
    }
    case 'blackhole': return '#0d0020'
    case 'asteroid': return '#9a9a9a'
  }
}

function computeAccelerations(bodies: Body[], G: number): { ax: number; ay: number }[] {
  const n = bodies.length
  const accels: { ax: number; ay: number }[] = Array.from({ length: n }, () => ({ ax: 0, ay: 0 }))

  for (let i = 0; i < n; i++) {
    if (bodies[i].pinned) continue
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const dx = bodies[j].x - bodies[i].x
      const dy = bodies[j].y - bodies[i].y
      const distSq = dx * dx + dy * dy
      const softDistSq = distSq + SOFTENING_SQ
      const softDist = Math.sqrt(softDistSq)
      const f = (G * bodies[j].mass) / softDistSq
      accels[i].ax += (f * dx) / softDist
      accels[i].ay += (f * dy) / softDist
    }
  }

  return accels
}

export interface CollisionEvent {
  x: number
  y: number
  color: string
  relativeSpeed: number
  radius: number
  vx: number
  vy: number
  spawnDebris: boolean  // false when both bodies are asteroids — prevents chain reactions
  absorberType: BodyType
  absorbedType: BodyType
  absorbedColor: string
  absorbedX: number
  absorbedY: number
  survivorId: string
}

export function step(
  bodies: Body[],
  G: number,
  dt: number
): { bodies: Body[]; collisions: CollisionEvent[] } {
  if (bodies.length === 0) return { bodies, collisions: [] }

  // Velocity Verlet step 1: update positions, save old accelerations
  for (const b of bodies) {
    if (b.pinned) {
      b.trail.push({ x: b.x, y: b.y })
      if (b.trail.length > TRAIL_LENGTH) b.trail.shift()
      continue
    }
    b.x += b.vx * dt + 0.5 * b.ax * dt * dt
    b.y += b.vy * dt + 0.5 * b.ay * dt * dt
    b.prevAx = b.ax
    b.prevAy = b.ay
    b.trail.push({ x: b.x, y: b.y })
    if (b.trail.length > TRAIL_LENGTH) b.trail.shift()
  }

  const newAccels = computeAccelerations(bodies, G)

  // Velocity Verlet step 2: update velocities with averaged acceleration
  for (let i = 0; i < bodies.length; i++) {
    if (bodies[i].pinned) continue
    bodies[i].vx += 0.5 * (bodies[i].prevAx + newAccels[i].ax) * dt
    bodies[i].vy += 0.5 * (bodies[i].prevAy + newAccels[i].ay) * dt
    bodies[i].ax = newAccels[i].ax
    bodies[i].ay = newAccels[i].ay
  }

  return handleCollisions(bodies)
}

function handleCollisions(bodies: Body[]): { bodies: Body[]; collisions: CollisionEvent[] } {
  const toRemove = new Set<number>()
  const collisions: CollisionEvent[] = []

  for (let i = 0; i < bodies.length; i++) {
    if (toRemove.has(i)) continue
    for (let j = i + 1; j < bodies.length; j++) {
      if (toRemove.has(j)) continue
      const dx = bodies[j].x - bodies[i].x
      const dy = bodies[j].y - bodies[i].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < (bodies[i].radius + bodies[j].radius) * 0.75) {
        const totalMass = bodies[i].mass + bodies[j].mass
        const cx = (bodies[i].x * bodies[i].mass + bodies[j].x * bodies[j].mass) / totalMass
        const cy = (bodies[i].y * bodies[i].mass + bodies[j].y * bodies[j].mass) / totalMass
        const dvx = bodies[i].vx - bodies[j].vx
        const dvy = bodies[i].vy - bodies[j].vy
        const mergedVx = (bodies[i].vx * bodies[i].mass + bodies[j].vx * bodies[j].mass) / totalMass
        const mergedVy = (bodies[i].vy * bodies[i].mass + bodies[j].vy * bodies[j].mass) / totalMass

        // Heavier body survives and keeps its type — outcome must not depend on placement order
        const sur = bodies[i].mass >= bodies[j].mass ? i : j
        const abs = sur === i ? j : i

        collisions.push({
          x: cx,
          y: cy,
          color: bodies[sur].color,
          relativeSpeed: Math.sqrt(dvx * dvx + dvy * dvy),
          radius: Math.max(bodies[i].radius, bodies[j].radius),
          vx: mergedVx,
          vy: mergedVy,
          spawnDebris: bodies[i].type !== 'asteroid' && bodies[j].type !== 'asteroid',
          absorberType: bodies[sur].type,
          absorbedType: bodies[abs].type,
          absorbedColor: bodies[abs].color,
          absorbedX: bodies[abs].x,
          absorbedY: bodies[abs].y,
          survivorId: bodies[sur].id,
        })

        // Black holes don't get kicked — absorbed body's kinetic energy radiates away.
        // All other merges apply COLLISION_DAMPING so the result doesn't shoot off.
        const kickFraction = bodies[abs].mass / totalMass
        if (bodies[sur].type !== 'blackhole' || kickFraction >= 0.4) {
          bodies[sur].vx = mergedVx * COLLISION_DAMPING
          bodies[sur].vy = mergedVy * COLLISION_DAMPING
        }
        bodies[sur].x = cx
        bodies[sur].y = cy
        bodies[sur].mass = totalMass
        bodies[sur].radius = defaultRadius(totalMass, bodies[sur].type)
        toRemove.add(abs)

        // If i was absorbed, stop checking further j against it
        if (abs === i) break
      }
    }
  }

  if (toRemove.size === 0) return { bodies, collisions }
  return { bodies: bodies.filter((_, i) => !toRemove.has(i)), collisions }
}

// Predict the path of a new body given the current frozen gravitational field.
// Uses Velocity Verlet (symplectic) so stable orbits stay closed in the preview.
export function predictPath(
  bodies: Body[],
  newBody: { x: number; y: number; vx: number; vy: number; mass: number; radius: number },
  G: number,
  steps = 120,
  dtPerStep = 2.5,
): { x: number; y: number }[] {
  let x = newBody.x, y = newBody.y, vx = newBody.vx, vy = newBody.vy

  // Compute initial acceleration from the frozen field
  let ax = 0, ay = 0
  for (const b of bodies) {
    const dx = b.x - x, dy = b.y - y
    const distSq = dx * dx + dy * dy + SOFTENING_SQ
    const dist = Math.sqrt(distSq)
    ax += G * b.mass * dx / (distSq * dist)
    ay += G * b.mass * dy / (distSq * dist)
  }

  const path: { x: number; y: number }[] = []
  const rNew = newBody.radius

  for (let s = 0; s < steps; s++) {
    // Verlet step 1 — update position
    x += vx * dtPerStep + 0.5 * ax * dtPerStep * dtPerStep
    y += vy * dtPerStep + 0.5 * ay * dtPerStep * dtPerStep

    const prevAx = ax, prevAy = ay
    ax = 0; ay = 0

    // Recompute acceleration at new position (bodies frozen)
    for (const b of bodies) {
      const dx = b.x - x, dy = b.y - y
      const distSq = dx * dx + dy * dy + SOFTENING_SQ
      const dist = Math.sqrt(distSq)
      ax += G * b.mass * dx / (distSq * dist)
      ay += G * b.mass * dy / (distSq * dist)
    }

    // Verlet step 2 — update velocity with averaged acceleration
    vx += 0.5 * (prevAx + ax) * dtPerStep
    vy += 0.5 * (prevAy + ay) * dtPerStep

    path.push({ x, y })

    // Stop path if new body would be absorbed by an existing one
    for (const b of bodies) {
      const dx = b.x - x, dy = b.y - y
      if (dx * dx + dy * dy < (b.radius + rNew) * (b.radius + rNew) * 0.5625) return path
    }
  }

  return path
}
