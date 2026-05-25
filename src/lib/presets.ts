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

// Circular orbit velocity around a central mass at radius r
const circV = (G: number, M: number, r: number) => Math.sqrt(G * M / r)

export type PresetName =
  | 'binary' | 'solar' | 'figure8' | 'slingshot' | 'blackhole'
  | 'galaxy' | 'chaos' | 'trojan' | 'rogue' | 'quadruple' | 'pulsar'

export const PRESETS: Record<PresetName, (w: number, h: number, G: number) => Body[]> = {

  // ── Existing ─────────────────────────────────────────────────────────────

  binary(w, h, G) {
    const cx = w / 2, cy = h / 2
    const M = 500, d = 115
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
      { r: 80,  m: 4,   c: '#aaaaaa' },
      { r: 125, m: 10,  c: '#e8cda0' },
      { r: 175, m: 12,  c: '#4fa3e0' },
      { r: 235, m: 6,   c: '#c1440e' },
      { r: 330, m: 55,  c: '#c9a96e' },
    ].map(({ r, m, c }) => makeBody('planet', cx + r, cy, 0, circV(G, Msun, r), m, c))
    return [sun, ...planets]
  },

  figure8(w, h, G) {
    const cx = w / 2, cy = h / 2
    const m = 150, L = 110
    const x0 = 0.97000436 * L, y0 = -0.24308753 * L
    const Vscale = Math.sqrt(G * m / L)
    const vx0 = 0.93240737 * Vscale, vy0 = 0.86473146 * Vscale
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
    for (let i = 0; i < 12; i++) {
      const t = i / 12
      const sx = 50 + Math.random() * 30
      const sy = cy - 320 + t * 640
      const tx = cx + 80 + (Math.random() - 0.5) * 40
      const ty = cy + (Math.random() - 0.5) * 60
      const dx = tx - sx, dy = ty - sy
      const mag = Math.sqrt(dx * dx + dy * dy)
      const spd = 3.5 + Math.random() * 2.5
      asteroids.push(makeBody('asteroid', sx, sy, spd * dx / mag, spd * dy / mag, 1 + Math.random() * 2, '#9a9a9a'))
    }
    return [planet, ...asteroids]
  },

  blackhole(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Mbh = 3000
    const bh = makeBody('blackhole', cx, cy, 0, 0, Mbh, '#0d0020', true)
    const debris: Body[] = []
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.3
      const r = 90 + Math.random() * 220
      const vc = circV(G, Mbh, r) * (0.6 + Math.random() * 0.8)
      debris.push(makeBody('asteroid',
        cx + Math.cos(angle) * r, cy + Math.sin(angle) * r,
        -Math.sin(angle) * vc, Math.cos(angle) * vc,
        1 + Math.random() * 3, '#9a9a9a'))
    }
    return [bh, ...debris]
  },

  // ── New ──────────────────────────────────────────────────────────────────

  galaxy(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Mbh = 1100
    const bulkVx = 1.9  // approach speed

    const makeGalaxy = (gx: number, gy: number, vx: number, angleOffset: number): Body[] => {
      const bh = makeBody('blackhole', gx, gy, vx, 0, Mbh, '#0d0020')
      const members: { r: number; m: number; c: string; type: BodyType }[] = [
        { r: 55,  m: 18, c: '#FFD700', type: 'star'   },
        { r: 90,  m: 10, c: '#4fa3e0', type: 'planet' },
        { r: 125, m: 8,  c: '#e8a050', type: 'planet' },
        { r: 162, m: 6,  c: '#c478e8', type: 'planet' },
      ]
      const orbiters = members.map(({ r, m, c, type }, i) => {
        const angle = angleOffset + (i / members.length) * Math.PI * 2
        const vc = circV(G, Mbh, r)
        return makeBody(type,
          gx + Math.cos(angle) * r,
          gy + Math.sin(angle) * r,
          vx - Math.sin(angle) * vc,
          Math.cos(angle) * vc,
          m, c)
      })
      return [bh, ...orbiters]
    }

    return [
      ...makeGalaxy(cx - 270, cy - 25,  bulkVx, 0.5),
      ...makeGalaxy(cx + 270, cy + 25, -bulkVx, 2.1),
    ]
  },

  chaos(w, h, G) {
    const cx = w / 2, cy = h / 2
    const m = 280, r = 145
    // Equilateral triangle orbit speed: v = sqrt(G*m / (r*√3))
    const v = Math.sqrt(G * m / (r * Math.sqrt(3)))
    const angles = [Math.PI / 2, Math.PI / 2 + 2 * Math.PI / 3, Math.PI / 2 + 4 * Math.PI / 3]
    const colors = ['#FFD700', '#FF6B6B', '#90EE90']
    return angles.map((angle, i) => {
      // Small velocity boost on one body to break symmetry and trigger chaos
      const boost = i === 2 ? 1.09 : 1.0
      return makeBody('star',
        cx + r * Math.cos(angle),
        cy + r * Math.sin(angle),
        -Math.sin(angle) * v * boost,
        Math.cos(angle) * v * boost,
        m, colors[i])
    })
  },

  trojan(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Mstar = 1100
    const star = makeBody('star', cx, cy, 0, 0, Mstar, '#FFD700', true)

    const r = 185
    const vc = circV(G, Mstar, r)
    const planet = makeBody('planet', cx + r, cy, 0, vc, 22, '#4fa3e0')

    // L4 (+60°) and L5 (−60°) Lagrange points share the planet's orbit radius and speed
    const trojans: Body[] = []
    for (const sign of [1, -1]) {
      const la = sign * Math.PI / 3         // ±60°
      const lx = cx + r * Math.cos(la)
      const ly = cy + r * Math.sin(la)
      const lvx = -Math.sin(la) * vc
      const lvy =  Math.cos(la) * vc
      for (let i = 0; i < 7; i++) {
        const ox = (Math.random() - 0.5) * 24
        const oy = (Math.random() - 0.5) * 24
        const dv = 0.25
        trojans.push(makeBody('asteroid',
          lx + ox, ly + oy,
          lvx + (Math.random() - 0.5) * dv,
          lvy + (Math.random() - 0.5) * dv,
          1 + Math.random(), '#c8b85a'))
      }
    }
    return [star, planet, ...trojans]
  },

  rogue(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Msun = 1100
    const sun = makeBody('star', cx, cy, 0, 0, Msun, '#FFD700', true)

    const planets = [
      { r: 85,  m: 8,  c: '#aaaaaa' },
      { r: 145, m: 14, c: '#4fa3e0' },
      { r: 210, m: 11, c: '#7ed880' },
      { r: 285, m: 7,  c: '#c478e8' },
    ].map(({ r, m, c }) => makeBody('planet', cx + r, cy, 0, circV(G, Msun, r), m, c))

    // Rogue star enters from the left on a hyperbolic trajectory — aim just past the sun
    const rogue = makeBody('star', cx - w * 0.55, cy - 110, 5.8, 0.35, 380, '#FF6633')

    return [sun, ...planets, rogue]
  },

  quadruple(w, h, G) {
    const cx = w / 2, cy = h / 2
    const m = 200      // mass of each star
    const D = 148      // distance from total COM to each pair's COM
    const d = 38       // half-separation within each pair

    // v² = G*m/(4d)  →  each star orbiting its pair's COM
    const vInner = Math.sqrt(G * m / (4 * d))
    // v² = G*m/(2D)  →  each pair's COM orbiting the total COM
    const vOuter = Math.sqrt(G * m / (2 * D))

    return [
      // Pair A (left) — COM moves in −y direction
      makeBody('star', cx - D, cy - d,  vInner, -vOuter, m, '#FFD700'),
      makeBody('star', cx - D, cy + d, -vInner, -vOuter, m, '#FFAA44'),
      // Pair B (right) — COM moves in +y direction
      makeBody('star', cx + D, cy - d,  vInner,  vOuter, m, '#88BBFF'),
      makeBody('star', cx + D, cy + d, -vInner,  vOuter, m, '#4488EE'),
    ]
  },

  pulsar(w, h, G) {
    const cx = w / 2, cy = h / 2
    const Mbh = 3200
    const bh = makeBody('blackhole', cx, cy, 0, 0, Mbh, '#0d0020')

    // Companion star in a close, blazing-fast orbit
    const r = 105
    const star = makeBody('star', cx + r, cy, 0, circV(G, Mbh, r), 480, '#FFD700')

    // Scattered debris on eccentric orbits
    const debris: Body[] = []
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      const orbitR = 190 + Math.random() * 130
      const eccV = circV(G, Mbh, orbitR) * (0.45 + Math.random() * 0.5)
      debris.push(makeBody('asteroid',
        cx + Math.cos(angle) * orbitR,
        cy + Math.sin(angle) * orbitR,
        -Math.sin(angle) * eccV,
        Math.cos(angle) * eccV,
        2 + Math.random() * 3, '#9a9a9a'))
    }

    return [bh, star, ...debris]
  },
}
