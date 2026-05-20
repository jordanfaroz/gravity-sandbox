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
}

const SOFTENING_SQ = 50
const TRAIL_LENGTH = 150

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

export function step(bodies: Body[], G: number, dt: number): Body[] {
  if (bodies.length === 0) return bodies

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

function handleCollisions(bodies: Body[]): Body[] {
  const toRemove = new Set<number>()

  for (let i = 0; i < bodies.length; i++) {
    if (toRemove.has(i)) continue
    for (let j = i + 1; j < bodies.length; j++) {
      if (toRemove.has(j)) continue
      const dx = bodies[j].x - bodies[i].x
      const dy = bodies[j].y - bodies[i].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < (bodies[i].radius + bodies[j].radius) * 0.75) {
        const totalMass = bodies[i].mass + bodies[j].mass
        // Conserve momentum
        bodies[i].vx = (bodies[i].vx * bodies[i].mass + bodies[j].vx * bodies[j].mass) / totalMass
        bodies[i].vy = (bodies[i].vy * bodies[i].mass + bodies[j].vy * bodies[j].mass) / totalMass
        // Center of mass position
        bodies[i].x = (bodies[i].x * bodies[i].mass + bodies[j].x * bodies[j].mass) / totalMass
        bodies[i].y = (bodies[i].y * bodies[i].mass + bodies[j].y * bodies[j].mass) / totalMass
        bodies[i].mass = totalMass
        bodies[i].radius = defaultRadius(totalMass, bodies[i].type)
        toRemove.add(j)
      }
    }
  }

  if (toRemove.size === 0) return bodies
  return bodies.filter((_, i) => !toRemove.has(i))
}
