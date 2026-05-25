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

When two bodies overlap (distance < sum of radii × 0.75), they merge: the **heavier body always survives** and keeps its type. Momentum is conserved (with an inelastic damping factor so the merged body doesn't shoot off), position moves to the center of mass, and debris asteroids are ejected outward.

## Collision behaviour

- **Heavier body wins** — outcome is independent of placement order
- **Inelastic damping** — merged body retains 72% of momentum; the rest radiates away as heat
- **Black holes don't get kicked** — a BH absorbing a lighter body keeps its own velocity unchanged; only BH-on-BH mergers conserve momentum
- **Black hole absorbing a star** — triggers a multi-second spiral-in animation instead of an instant explosion (see below)

## Black hole absorption animation

When a black hole absorbs a star the physics merge is instant but a cinematic sequence plays over ~4 seconds:

1. A ghost star spawns at the star's last position and begins spiralling inward with an accelerating orbit
2. A comet-tail trail follows the ghost along the arc
3. Past the halfway point a bright accretion stream stretches from the ghost to the black hole
4. As the ghost reaches the event horizon a final flash bloom fires and the star disappears

## Collision effects (general)

When two non-asteroid bodies collide:

- **Flash bloom** — large radial gradient burst at the impact site
- **Shockwave rings** — two expanding rings that fade as they travel outward
- **Sparks** — 14–20 motion-blurred streaks
- **Fire** — soft radial-gradient fireballs in orange/yellow/white
- **Smoke** — slowly expanding dark clouds
- **Screen shake** — viewport jolts proportional to impact energy
- **Debris asteroids** — 3–5 real physics bodies ejected from the collision

Asteroid absorptions show only a small grey sparkle to prevent chain reactions.

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
    ├── renderer.ts           # Canvas drawing: glow, trails, accretion rings, particles, absorption
    ├── serialize.ts          # Compact base64 URL-hash encode/decode
    ├── presets.ts            # Eleven preset configurations
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
| **Galaxy Collision** | Two mini-galaxies (each a black hole + 4 orbiters) on a collision course |
| **3-Body Chaos** | Three equal stars in an unstable equilateral triangle — tiny perturbation triggers chaos |
| **Trojans** | Star + planet + 14 asteroids clustered at the L4 and L5 Lagrange points |
| **Rogue Star** | Stable solar system invaded by a rogue star on a hyperbolic trajectory |
| **Double Binary** | Two tight stellar pairs orbiting each other — hierarchical quadruple system |
| **Pulsar** | Massive black hole with a fast companion star and scattered eccentric debris |

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

## Viewport

- Zoom range: **0.04× – 25×**, pivot at the cursor
- Middle-mouse drag to pan
- Zoom widget at the top centre (− 1.00× +)

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
