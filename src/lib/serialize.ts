import { Body, BodyType } from './physics'

// Compact tuple: [type, x, y, vx, vy, mass, radius, color, pinned?]
type MinBody = [string, number, number, number, number, number, number, string, number?]

export function encodeBodies(bodies: Body[]): string {
  const min: MinBody[] = bodies.map(b => {
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
    if (b.pinned) entry.push(1)
    return entry
  })
  return btoa(JSON.stringify(min))
}

export function decodeBodies(hash: string): Body[] {
  try {
    const data = JSON.parse(atob(hash)) as MinBody[]
    return data.map(m => ({
      id: crypto.randomUUID(),
      type: m[0] as BodyType,
      x: m[1],
      y: m[2],
      vx: m[3],
      vy: m[4],
      mass: m[5],
      radius: m[6],
      color: m[7],
      pinned: m[8] === 1,
      ax: 0,
      ay: 0,
      prevAx: 0,
      prevAy: 0,
      trail: [],
    }))
  } catch {
    return []
  }
}
