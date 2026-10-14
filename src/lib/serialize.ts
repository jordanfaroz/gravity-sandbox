import { Body, BodyType } from './physics'
import { newId } from './utils'

// Compact tuple: [type, x, y, vx, vy, mass, radius, color, pinned?, name?]
// imageUrl is intentionally excluded — data URLs are too large for a URL hash
type MinBody = [string, number, number, number, number, number, number, string, number?, string?]

export interface Scene {
  bodies: Body[]
  speed: number
}

const VALID_TYPES: BodyType[] = ['star', 'planet', 'blackhole', 'asteroid']

// A shared link is untrusted input — it may be hand-edited, truncated, or from
// an older encoding. These bounds keep a bad link from crashing the tab (e.g.
// thousands of bodies hanging the O(n²) integrator) or rendering garbage
// instead of just failing to restore cleanly.
const MAX_BODIES = 300
const MAX_NAME_LENGTH = 60
const MAX_COORD = 1e5
const MAX_VELOCITY = 1e3
const MIN_MASS = 0.01
const MAX_MASS = 1e5
const MIN_RADIUS = 0.1
const MAX_RADIUS = 500
const MIN_SPEED = 0.1
const MAX_SPEED = 5

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function encodeScene(bodies: Body[], speed: number): string {
  const min: MinBody[] = bodies.slice(0, MAX_BODIES).map(b => {
    const entry: MinBody = [
      b.type,
      Math.round(b.x),
      Math.round(b.y),
      +b.vx.toFixed(3),
      +b.vy.toFixed(3),
      +b.mass.toFixed(1),
      +b.radius.toFixed(1),
      b.color,
    ]
    if (b.pinned || b.name) entry.push(b.pinned ? 1 : 0)
    if (b.name) entry.push(b.name)
    return entry
  })
  return btoa(JSON.stringify({ b: min, s: +speed.toFixed(2) }))
}

// Validates and clamps one decoded tuple. Returns null for anything that
// isn't shaped like a body at all, rather than letting NaN/garbage into the
// simulation.
function sanitizeBody(m: unknown): Body | null {
  if (!Array.isArray(m) || m.length < 8) return null
  const [type, x, y, vx, vy, mass, radius, color, pinned, name] = m as MinBody
  if (!VALID_TYPES.includes(type as BodyType)) return null
  if (![x, y, vx, vy, mass, radius].every(isFiniteNumber)) return null
  if (typeof color !== 'string' || color.length === 0 || color.length > 32) return null

  return {
    id: newId(),
    type: type as BodyType,
    x: clamp(x, -MAX_COORD, MAX_COORD),
    y: clamp(y, -MAX_COORD, MAX_COORD),
    vx: clamp(vx, -MAX_VELOCITY, MAX_VELOCITY),
    vy: clamp(vy, -MAX_VELOCITY, MAX_VELOCITY),
    mass: clamp(mass, MIN_MASS, MAX_MASS),
    radius: clamp(radius, MIN_RADIUS, MAX_RADIUS),
    color,
    pinned: pinned === 1,
    name: typeof name === 'string' ? name.slice(0, MAX_NAME_LENGTH) : undefined,
    ax: 0,
    ay: 0,
    prevAx: 0,
    prevAy: 0,
    trail: [],
  }
}

export function decodeScene(hash: string): Scene | null {
  try {
    const parsed: unknown = JSON.parse(atob(hash))
    // Accept both the current { b, s } shape and a bare array, which is what
    // links shared before `speed` was added to the encoding look like.
    const rawBodies = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { b?: unknown })?.b)
        ? (parsed as { b: unknown[] }).b
        : null
    if (!rawBodies) return null

    const bodies = rawBodies
      .slice(0, MAX_BODIES)
      .map(sanitizeBody)
      .filter((b): b is Body => b !== null)
    if (bodies.length === 0) return null

    const rawSpeed = (parsed as { s?: unknown })?.s
    const speed = isFiniteNumber(rawSpeed) ? clamp(rawSpeed, MIN_SPEED, MAX_SPEED) : 1

    return { bodies, speed }
  } catch {
    return null
  }
}
