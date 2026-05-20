import { Body, BodyType, defaultRadius } from './physics'

function makeBody(
  type: BodyType,
  x: number,
  y: number,
  vx: number,
  vy: number,
  mass: number,
  color: string,
  pinned = false
): Body {
  return {
    id: crypto.randomUUID(),
    type, x, y, vx, vy,
    ax: 0, ay: 0, prevAx: 0, prevAy: 0,
    mass,
    radius: defaultRadius(mass, type),
    trail: [],
    color,
    pinned,
  }
}

// Circular orbit velocity around a central mass
const circV = (G: number, M: number, r: number) => Math.sqrt(G * M / r)

export type PresetName = 'binary' | 'solar' | 'figure8' | 'slingshot' | 'blackhole'

export const PRESETS: Record<PresetName, (w: number, h: number, G: number) => Body[]> = {
  binary(w, h, G) {
    const cx = w / 2, cy = h / 2
    const M = 500
    const d = 115 // half-separation
    const v = Math.sqrt(G * M / (4 * d))
    return [
      makeBody('star', cx - d, cy, 0, -v, M, '#FFD700'),
      makeBody('star', cx + d, cy, 0,  v, M, '#FF9966'),
    ]
  },

  solar(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Msun = 1200
    const sun = makeBody('star', cx, cy, 0, 0, Msun, '#FFD700', true)

    const planets = [
      { r: 80,  m: 4,   c: '#aaaaaa', name: 'mercury' },
      { r: 125, m: 10,  c: '#e8cda0', name: 'venus'   },
      { r: 175, m: 12,  c: '#4fa3e0', name: 'earth'   },
      { r: 235, m: 6,   c: '#c1440e', name: 'mars'    },
      { r: 330, m: 55,  c: '#c9a96e', name: 'jupiter' },
    ].map(({ r, m, c }) => {
      const v = circV(G, Msun, r)
      return makeBody('planet', cx + r, cy, 0, v, m, c)
    })

    return [sun, ...planets]
  },

  figure8(w, h, G) {
    const cx = w / 2, cy = h / 2
    const m = 150
    const L = 110 // position scale factor

    // Chenciner-Montgomery figure-8 orbit (G=1, m=1 normalized)
    const x0 = 0.97000436 * L
    const y0 = -0.24308753 * L
    // Velocity scale: V = sqrt(G_sim * m / L) to match G=1,m=1 dynamics
    const Vscale = Math.sqrt(G * m / L)
    const vx0 = 0.93240737 * Vscale
    const vy0 = 0.86473146 * Vscale

    return [
      makeBody('planet', cx - x0, cy - y0,  vx0 / 2, vy0 / 2, m, '#4fa3e0'),
      makeBody('planet', cx,       cy,       -vx0,    -vy0,    m, '#ff6b6b'),
      makeBody('planet', cx + x0, cy + y0,  vx0 / 2, vy0 / 2, m, '#90ee90'),
    ]
  },

  slingshot(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Mbig = 1000
    const planet = makeBody('planet', cx + 80, cy, 0, 0, Mbig, '#4fa3e0', true)

    const asteroids: Body[] = []
    const count = 12
    for (let i = 0; i < count; i++) {
      const t = i / count
      const startX = 50 + Math.random() * 30
      const startY = cy - 320 + t * 640
      // Aim slightly past the planet center for the slingshot bend
      const targetX = cx + 80 + (Math.random() - 0.5) * 40
      const targetY = cy + (Math.random() - 0.5) * 60
      const dx = targetX - startX
      const dy = targetY - startY
      const mag = Math.sqrt(dx * dx + dy * dy)
      const spd = 3.5 + Math.random() * 2.5
      asteroids.push(
        makeBody('asteroid', startX, startY, (spd * dx) / mag, (spd * dy) / mag, 1 + Math.random() * 2, '#9a9a9a')
      )
    }
    return [planet, ...asteroids]
  },

  blackhole(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Mbh = 3000
    const bh = makeBody('blackhole', cx, cy, 0, 0, Mbh, '#0d0020', true)

    const debris: Body[] = []
    const count = 24
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3
      const r = 90 + Math.random() * 220
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      // Mostly circular orbits with some eccentricity
      const vc = circV(G, Mbh, r)
      const eccFactor = 0.6 + Math.random() * 0.8
      const vx = -Math.sin(angle) * vc * eccFactor
      const vy = Math.cos(angle) * vc * eccFactor
      debris.push(
        makeBody('asteroid', x, y, vx, vy, 1 + Math.random() * 3, '#9a9a9a')
      )
    }
    return [bh, ...debris]
  },
}
