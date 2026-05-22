# N-Body Gravity Sandbox

Interactive gravitational physics simulation running entirely in the browser. Place stars, planets, black holes, and asteroids on a canvas — watch real orbits emerge from Newton's law of universal gravitation, computed fresh every frame with no physics library.

## How the physics works

Every body exerts a force on every other body each frame:

```
F = G × m₁ × m₂ / (d² + ε)
```

`ε = 50` is a softening factor that prevents the force from blowing up when two bodies pass very close — close passes become gravitational slingshots instead of singularities.

Force becomes acceleration via `F = ma`, which updates velocity, which updates position.

**Velocity Verlet integration** is used instead of Euler. Euler slowly bleeds energy out of orbits — planets spiral inward over time. Verlet is symplectic (energy-conserving), so stable orbits stay stable indefinitely. Each step averages the old and new acceleration when updating velocity:

```
x      +=  vx·dt + ½·ax·dt²
ax_new  =  recompute forces
vx     +=  ½·(ax_old + ax_new)·dt
```

When two bodies overlap (distance < sum of radii × 0.75), they merge: momentum is conserved, position moves to the center of mass, and the smaller body is absorbed. Real debris asteroids are ejected outward from the collision site.

## File structure

```
src/
├── app/
│   ├── page.tsx              # Root — renders GravitySandbox full screen
│   └── layout.tsx
├── components/
│   ├── gravity-sandbox.tsx   # Main component: canvas, rAF loop, mouse events
│   ├── toolbar.tsx           # Body picker, G slider, speed, controls, presets
│   ├── body-tooltip.tsx      # Hover card: type, mass, speed
│   └── ui/
│       └── liquid-glass-button.tsx  # Glass-morphism button with SVG filter
└── lib/
    ├── physics.ts            # Body type, step(), Verlet integrator, collisions
    ├── renderer.ts           # Canvas drawing: glow, trails, accretion rings, particles
    ├── serialize.ts          # Compact base64 URL-hash encode/decode
    ├── presets.ts            # Five preset configurations
    └── utils.ts              # cn() helper (clsx + tailwind-merge)
```

## Presets

| Preset | Description |
|---|---|
| **Binary Stars** | Two equal-mass stars orbiting their common center of mass |
| **Solar System** | Pinned sun + 5 planets with correct circular-orbit velocities |
| **Figure-8** | Chenciner–Montgomery three-body choreography, scaled from the G=1 solution |
| **Slingshot** | Pinned planet with 12 asteroids on hyperbolic fly-bys |
| **Black Hole Field** | 24 asteroids in eccentric orbits around a central singularity |

## Controls

| Action | Input |
|---|---|
| Place body | Click |
| Set initial velocity | Click + drag — arrow preview shows direction and magnitude |
| Drag existing body | Click and hold on a body — simulation pauses while dragging, resumes on release |
| Delete body | Right-click |
| Zoom | Scroll wheel (centered on cursor) or ± buttons at top |
| Pan | Middle-mouse drag |
| Hover info | Mouse over any body — shows type, mass, speed |
| Pause / resume | Toolbar button |
| Share | Encodes all bodies into the URL hash, copies link to clipboard |

## Collision effects

When two non-asteroid bodies collide a full explosion fires:

- **Flash bloom** — a large radial gradient burst at the impact site
- **Shockwave rings** — two expanding rings that fade as they travel outward
- **Sparks** — 14–20 motion-blurred streaks flying outward
- **Fire** — soft radial-gradient fireballs in orange/yellow/white
- **Smoke** — slowly expanding dark clouds that linger
- **Screen shake** — viewport jolts proportional to impact energy
- **Debris asteroids** — 3–5 real physics bodies ejected from the collision, visible as grey rocks that then orbit, escape, or get recaptured

Asteroid-on-body absorptions show only a small grey sparkle to avoid chain reactions.

## Viewport

- Zoom range: **0.04× – 25×**, pivot at the cursor
- Middle-mouse drag to pan
- Zoom widget at the top center (− 1.00× +)

## Shareable URLs

The full simulation state is encoded as a compact base64 string in `window.location.hash`. Trails and runtime IDs are stripped — only position, velocity, mass, radius, color, and type are saved. Pasting the URL exactly restores the simulation at that moment.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **Tailwind CSS v4**
- **Pure 2D Canvas** — no Three.js, no physics library

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
