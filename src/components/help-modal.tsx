'use client'

import { useState, ReactNode } from 'react'

type Tab = 'controls' | 'bodies' | 'presets' | 'physics'

// ── SVG Illustrations ──────────────────────────────────────────────────────

function VelocityDemoSVG() {
  return (
    <svg viewBox="0 0 340 130" className="w-full rounded-xl mt-3 border border-white/10" style={{ background: '#08080f' }}>
      {[[30,20],[295,38],[162,8],[48,112],[312,92],[222,68],[14,58]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="white" opacity="0.22"/>
      ))}
      <defs>
        <radialGradient id="vd-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4fa3e0" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#4fa3e0" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="vd-core" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45"/>
          <stop offset="100%" stopColor="#4fa3e0"/>
        </radialGradient>
      </defs>
      <circle cx="78" cy="72" r="25" fill="url(#vd-glow)"/>
      <circle cx="78" cy="72" r="10" fill="url(#vd-core)"/>
      <line x1="70" y1="72" x2="86" y2="72" stroke="rgba(255,255,255,0.38)" strokeWidth="1.5"/>
      <line x1="78" y1="64" x2="78" y2="80" stroke="rgba(255,255,255,0.38)" strokeWidth="1.5"/>
      <line x1="78" y1="72" x2="200" y2="36" stroke="white" strokeWidth="2" strokeDasharray="6,4" opacity="0.88"/>
      <polygon points="200,36 190,44 196,31" fill="white" opacity="0.88"/>
      <path d="M78,72 C118,15 260,15 308,65 C324,93 268,126 198,126 C118,126 62,106 78,72"
        fill="none" stroke="#4fa3e0" strokeWidth="1.5" strokeDasharray="5,5" opacity="0.38"/>
      <circle cx="268" cy="102" r="4" fill="#4fa3e0" opacity="0.38"/>
      <text x="78" y="108" fill="white" fontSize="9.5" textAnchor="middle" opacity="0.65" fontFamily="sans-serif">① click</text>
      <text x="216" y="28" fill="white" fontSize="9.5" textAnchor="middle" opacity="0.65" fontFamily="sans-serif">② drag → set velocity</text>
      <text x="294" y="120" fill="#4fa3e0" fontSize="9" textAnchor="middle" opacity="0.5" fontFamily="sans-serif">orbit path</text>
      <text x="330" y="14" fill="white" fontSize="8.5" textAnchor="end" opacity="0.3" fontFamily="sans-serif">release to launch</text>
    </svg>
  )
}

function MoveDemoSVG() {
  return (
    <svg viewBox="0 0 320 100" className="w-full rounded-xl mt-3 border border-white/10" style={{ background: '#08080f' }}>
      <defs>
        <radialGradient id="md-ghost" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <radialGradient id="md-star" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="15%" stopColor="#FFD700"/>
          <stop offset="55%" stopColor="#FFD700" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <circle cx="82" cy="50" r="32" fill="url(#md-ghost)"/>
      <circle cx="82" cy="50" r="11" fill="#FFD700" opacity="0.18"/>
      <text x="82" y="90" fill="white" fontSize="9" textAnchor="middle" opacity="0.36" fontFamily="sans-serif">original position</text>
      <rect x="142" y="18" width="7" height="14" rx="2" fill="white" opacity="0.28"/>
      <rect x="152" y="18" width="7" height="14" rx="2" fill="white" opacity="0.28"/>
      <text x="156" y="14" fill="white" fontSize="8" textAnchor="middle" opacity="0.28" fontFamily="sans-serif">sim pauses</text>
      <line x1="103" y1="50" x2="205" y2="50" stroke="white" strokeWidth="2" strokeDasharray="5,4" opacity="0.52"/>
      <polygon points="205,50 195,45 195,55" fill="white" opacity="0.52"/>
      <text x="154" y="43" fill="white" fontSize="9" textAnchor="middle" opacity="0.46" fontFamily="sans-serif">hold + drag</text>
      <circle cx="238" cy="50" r="36" fill="url(#md-star)"/>
      <text x="238" y="90" fill="white" fontSize="9" textAnchor="middle" opacity="0.6" fontFamily="sans-serif">new position</text>
    </svg>
  )
}

// ── Body type visuals ──────────────────────────────────────────────────────

function StarSVG() {
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 flex-shrink-0">
      <defs>
        <radialGradient id="hs-star">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="18%" stopColor="#FFD700"/>
          <stop offset="58%" stopColor="#FFD700" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="28" fill="url(#hs-star)"/>
    </svg>
  )
}

function PlanetSVG() {
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 flex-shrink-0">
      <defs>
        <radialGradient id="hs-ph" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4fa3e0" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <radialGradient id="hs-pc" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42"/>
          <stop offset="100%" stopColor="#4fa3e0"/>
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="28" fill="url(#hs-ph)"/>
      <circle cx="28" cy="28" r="13" fill="url(#hs-pc)"/>
    </svg>
  )
}

function BlackHoleSVG() {
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 flex-shrink-0">
      <defs>
        <radialGradient id="hs-bhg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5500DD" stopOpacity="0.45"/>
          <stop offset="65%" stopColor="#002299" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="28" fill="url(#hs-bhg)"/>
      <circle cx="28" cy="28" r="22" fill="none" stroke="#3311AA" strokeWidth="1.2" opacity="0.28"/>
      <circle cx="28" cy="28" r="18" fill="none" stroke="#6633CC" strokeWidth="1.5" opacity="0.55"/>
      <circle cx="28" cy="28" r="14" fill="none" stroke="#8855ff" strokeWidth="2" opacity="0.9"/>
      <circle cx="28" cy="28" r="11" fill="#000"/>
      <circle cx="28" cy="28" r="12" fill="none" stroke="#aa44ff" strokeWidth="1.5" opacity="0.82"/>
    </svg>
  )
}

function AsteroidSVG() {
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 flex-shrink-0">
      <circle cx="28" cy="28" r="5.5" fill="#9a9a9a"/>
      <circle cx="28" cy="28" r="7" fill="none" stroke="#9a9a9a" strokeWidth="0.5" opacity="0.28"/>
    </svg>
  )
}

// ── Preset mini orbit diagrams ─────────────────────────────────────────────

function BinaryDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="35" cy="35" r="18" fill="none" stroke="white" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.3"/>
      <circle cx="17" cy="35" r="5.5" fill="#FFD700"/>
      <circle cx="53" cy="35" r="5.5" fill="#FF9966"/>
    </svg>
  )
}

function SolarDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="35" cy="35" r="6" fill="#FFD700"/>
      {([11,16,22,28,34] as const).map((r,i) => (
        <g key={r}>
          <circle cx="35" cy="35" r={r} fill="none" stroke="white" strokeWidth="0.5" opacity="0.18"/>
          <circle cx={35+r} cy="35" r={[2,2.5,2.5,2,3][i]} fill={['#aaa','#4fa3e0','#c1440e','#aaa','#c9a96e'][i]}/>
        </g>
      ))}
    </svg>
  )
}

function Figure8Diagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <path
        d="M35,35 C35,18 52,18 52,35 C52,52 35,52 35,35 C35,18 18,18 18,35 C18,52 35,52 35,35 Z"
        fill="none" stroke="#90ee90" strokeWidth="1.5" opacity="0.7"/>
      <circle cx="18" cy="35" r="3.5" fill="#4fa3e0"/>
      <circle cx="52" cy="35" r="3.5" fill="#ff6b6b"/>
      <circle cx="35" cy="21" r="3.5" fill="#90ee90"/>
    </svg>
  )
}

function SlingshotDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="40" cy="35" r="7" fill="#4fa3e0"/>
      {([[8,14],[8,25],[8,38],[8,50]] as [number,number][]).map(([x,y],i) => (
        <line key={i} x1={x} y1={y} x2={38} y2={35} stroke="#aaa" strokeWidth="1" opacity="0.52"/>
      ))}
      <line x1="38" y1="28" x2="62" y2="10" stroke="#aaa" strokeWidth="1" strokeDasharray="3,2" opacity="0.4"/>
      <line x1="38" y1="42" x2="62" y2="60" stroke="#aaa" strokeWidth="1" strokeDasharray="3,2" opacity="0.4"/>
    </svg>
  )
}

function BlackHoleFieldDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="35" cy="35" r="8" fill="#1a0035"/>
      <circle cx="35" cy="35" r="9" fill="none" stroke="#8855ff" strokeWidth="1.5" opacity="0.85"/>
      <ellipse cx="35" cy="35" rx="20" ry="14" fill="none" stroke="#9a9a9a" strokeWidth="1" strokeDasharray="3,3" opacity="0.38"/>
      <ellipse cx="35" cy="35" rx="26" ry="10" fill="none" stroke="#9a9a9a" strokeWidth="1" strokeDasharray="3,3" opacity="0.28" transform="rotate(40 35 35)"/>
      {([[55,35],[15,35],[35,13],[35,57],[50,18]] as [number,number][]).map(([cx,cy],i) => (
        <circle key={i} cx={cx} cy={cy} r="2" fill="#9a9a9a" opacity="0.65"/>
      ))}
    </svg>
  )
}

function GalaxyDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="18" cy="35" r="5" fill="#1a0035"/>
      <circle cx="18" cy="35" r="6.5" fill="none" stroke="#8855ff" strokeWidth="1" opacity="0.7"/>
      {([8,13,18] as const).map((r,i) => (
        <circle key={i} cx={18+r} cy="35" r="2" fill={(['#FFD700','#4fa3e0','#e8a050'] as const)[i]} opacity="0.8"/>
      ))}
      <line x1="28" y1="35" x2="39" y2="35" stroke="white" strokeWidth="1.5" opacity="0.4"/>
      <polygon points="39,35 35,32 35,38" fill="white" opacity="0.4"/>
      <circle cx="54" cy="35" r="5" fill="#1a0035"/>
      <circle cx="54" cy="35" r="6.5" fill="none" stroke="#8855ff" strokeWidth="1" opacity="0.7"/>
      {([8,13,18] as const).map((r,i) => (
        <circle key={i} cx={54-r} cy="35" r="2" fill={(['#FFD700','#4fa3e0','#e8a050'] as const)[i]} opacity="0.8"/>
      ))}
      <line x1="44" y1="35" x2="33" y2="35" stroke="white" strokeWidth="1.5" opacity="0.4"/>
      <polygon points="33,35 37,32 37,38" fill="white" opacity="0.4"/>
    </svg>
  )
}

function ChaosDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <path d="M35,14 C56,28 52,56 30,58 C8,60 6,24 35,14" fill="none" stroke="#FFD700" strokeWidth="1.2" opacity="0.52" strokeDasharray="3,3"/>
      <path d="M35,14 C16,20 6,46 20,58 C34,66 62,42 35,14" fill="none" stroke="#FF6B6B" strokeWidth="1.2" opacity="0.52" strokeDasharray="3,3"/>
      <path d="M20,58 C14,72 52,72 30,58" fill="none" stroke="#90EE90" strokeWidth="1.2" opacity="0.52" strokeDasharray="3,3"/>
      <circle cx="35" cy="14" r="4" fill="#FFD700"/>
      <circle cx="14" cy="52" r="4" fill="#FF6B6B"/>
      <circle cx="52" cy="52" r="4" fill="#90EE90"/>
    </svg>
  )
}

function TrojanDiagram() {
  const r = 22
  const l4x = 35 + r * Math.cos(Math.PI / 3)
  const l4y = 35 - r * Math.sin(Math.PI / 3)
  const l5x = 35 + r * Math.cos(-Math.PI / 3)
  const l5y = 35 - r * Math.sin(-Math.PI / 3)
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="35" cy="35" r="5" fill="#FFD700"/>
      <circle cx="35" cy="35" r={r} fill="none" stroke="white" strokeWidth="0.6" opacity="0.22"/>
      <circle cx={35 + r} cy="35" r="3.5" fill="#4fa3e0"/>
      <circle cx={l4x} cy={l4y} r="2.2" fill="#c8b85a" opacity="0.8"/>
      <circle cx={l4x - 4} cy={l4y + 3} r="1.6" fill="#c8b85a" opacity="0.5"/>
      <circle cx={l4x + 3} cy={l4y - 3} r="1.6" fill="#c8b85a" opacity="0.5"/>
      <text x={l4x + 6} y={l4y + 1} fill="white" fontSize="6.5" opacity="0.48" fontFamily="sans-serif">L4</text>
      <circle cx={l5x} cy={l5y} r="2.2" fill="#c8b85a" opacity="0.8"/>
      <circle cx={l5x - 4} cy={l5y - 3} r="1.6" fill="#c8b85a" opacity="0.5"/>
      <circle cx={l5x + 3} cy={l5y + 3} r="1.6" fill="#c8b85a" opacity="0.5"/>
      <text x={l5x + 6} y={l5y + 4} fill="white" fontSize="6.5" opacity="0.48" fontFamily="sans-serif">L5</text>
    </svg>
  )
}

function RogueDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="42" cy="35" r="5" fill="#FFD700"/>
      {([11,16,21] as const).map((r,i) => (
        <g key={r}>
          <circle cx="42" cy="35" r={r} fill="none" stroke="white" strokeWidth="0.5" opacity="0.18"/>
          <circle cx={42+r} cy="35" r="2" fill={(['#aaa','#4fa3e0','#7ed880'] as const)[i]} opacity="0.8"/>
        </g>
      ))}
      <circle cx="6" cy="18" r="4.5" fill="#FF6633"/>
      <line x1="9" y1="21" x2="29" y2="31" stroke="#FF6633" strokeWidth="1.5" opacity="0.6" strokeDasharray="3,2"/>
      <polygon points="29,31 22,30 24,25" fill="#FF6633" opacity="0.6"/>
    </svg>
  )
}

function QuadrupleDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="35" cy="35" r="21" fill="none" stroke="white" strokeWidth="0.6" opacity="0.2"/>
      <ellipse cx="14" cy="35" rx="6" ry="10" fill="none" stroke="#FFD700" strokeWidth="0.8" opacity="0.38"/>
      <circle cx="14" cy="25" r="3.5" fill="#FFD700" opacity="0.9"/>
      <circle cx="14" cy="45" r="3.5" fill="#FFAA44" opacity="0.9"/>
      <ellipse cx="56" cy="35" rx="6" ry="10" fill="none" stroke="#88BBFF" strokeWidth="0.8" opacity="0.38"/>
      <circle cx="56" cy="25" r="3.5" fill="#88BBFF" opacity="0.9"/>
      <circle cx="56" cy="45" r="3.5" fill="#4488EE" opacity="0.9"/>
    </svg>
  )
}

function PulsarDiagram() {
  return (
    <svg viewBox="0 0 70 70" className="w-16 h-16">
      <circle cx="35" cy="35" r="8" fill="#000"/>
      <circle cx="35" cy="35" r="9" fill="none" stroke="#8855ff" strokeWidth="1.5" opacity="0.85"/>
      <circle cx="35" cy="35" r="15" fill="none" stroke="#FFD700" strokeWidth="1" opacity="0.38"/>
      <circle cx="50" cy="35" r="4" fill="#FFD700" opacity="0.9"/>
      {([[35,12],[56,20],[60,50],[35,60],[12,48],[10,20]] as [number,number][]).map(([cx,cy],i) => (
        <circle key={i} cx={cx} cy={cy} r="1.5" fill="#9a9a9a" opacity="0.55"/>
      ))}
    </svg>
  )
}

// ── Tab helpers ────────────────────────────────────────────────────────────

function SH({ children }: { children: ReactNode }) {
  return <h3 className="text-white/82 text-sm font-semibold mb-1.5">{children}</h3>
}
function SD({ children }: { children: ReactNode }) {
  return <p className="text-white/48 text-xs leading-relaxed">{children}</p>
}
function Row({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <div className={`flex gap-3 px-4 py-2.5 text-xs ${alt ? 'bg-white/[0.03]' : ''}`}>
      <span className="text-white/78 font-medium w-48 flex-shrink-0">{label}</span>
      <span className="text-white/44">{value}</span>
    </div>
  )
}

// ── Tab content ────────────────────────────────────────────────────────────

function ControlsTab() {
  return (
    <div className="space-y-7">
      <div>
        <SH>Placing a Body</SH>
        <SD>Select a body type from the toolbar, then <span className="text-white/70">click</span> (or <span className="text-white/70">tap</span> on mobile) anywhere on the canvas. The body appears at that point with zero velocity — gravity from nearby bodies will start pulling it immediately.</SD>
      </div>

      <div>
        <SH>Setting Initial Velocity</SH>
        <SD>Click and hold, then drag before releasing. The white dashed arrow shows the launch direction and speed — a longer drag means a faster launch. This is how you create stable circular orbits: launch perpendicular to the gravitational pull at the right speed.</SD>
        <VelocityDemoSVG />
      </div>

      <div>
        <SH>Repositioning a Body</SH>
        <SD>Click and hold on any <span className="text-white/70">existing body</span> to grab it. The simulation pauses while you drag it to a new position. Releasing resumes the simulation — the body retains its previous velocity.</SD>
        <MoveDemoSVG />
      </div>

      <div>
        <SH>All Controls</SH>
        <div className="rounded-xl border border-white/10 overflow-hidden mt-2">
          {[
            ['Click / Tap',              'Place the selected body type'],
            ['Click + Drag / Swipe',     'Set initial velocity (arrow preview shows direction + speed)'],
            ['Hold on body + Drag',      'Reposition an existing body (sim pauses while dragging)'],
            ['Right-click / Long-press', 'Delete a body instantly'],
            ['Scroll wheel / Pinch',     'Zoom in & out, centered on cursor / midpoint'],
            ['Middle-mouse drag',        'Pan the viewport'],
            ['Two-finger drag',          'Pan the viewport on mobile'],
            ['Pause / Resume',           'Freeze or continue the simulation'],
            ['Reset',                    'Remove all bodies and clear the canvas'],
            ['Share',                    'Encode the simulation into the URL — paste it anywhere to restore'],
            ['G slider',                 'Adjust the gravitational constant (stronger = faster orbits)'],
            ['Speed slider',             'Run simulation up to 5× faster or slower than real-time'],
          ].map(([k, v], i) => <Row key={i} label={k} value={v} alt={i % 2 === 0} />)}
        </div>
      </div>
    </div>
  )
}

function BodiesTab() {
  return (
    <div className="space-y-4">
      {[
        {
          svg: <StarSVG />,
          name: 'Star',
          mass: '800',
          desc: 'A massive luminous body with a wide radial glow. Stars can receive initial velocity when placed. Two colliding stars trigger a supernova — an expanding nebula ring, six shockwaves, 70 sparks, fireballs, and ejected debris asteroids.',
        },
        {
          svg: <PlanetSVG />,
          name: 'Planet',
          mass: '15',
          desc: 'A rocky or gaseous world. Planets leave curved orbit trails, can be captured by stars, slingshot around massive bodies, or fall into black holes. Best placed with a sideways velocity to create stable circular orbits.',
        },
        {
          svg: <BlackHoleSVG />,
          name: 'Black Hole',
          mass: '4000',
          desc: 'A gravitational singularity with an event horizon and three animated accretion rings. Absorbing a star triggers a 4-second spiral-in animation. Black holes absorbing lighter bodies keep their own velocity — the infalling mass radiates away as heat.',
        },
        {
          svg: <AsteroidSVG />,
          name: 'Asteroid',
          mass: '2',
          desc: 'A tiny rocky body shown with a dotted trail. Asteroids show only a small sparkle on collision (no explosion), preventing chain reactions. They are ejected as debris from major collisions and can accumulate into rings around massive objects.',
        },
      ].map(b => (
        <div key={b.name} className="flex gap-4 items-start p-4 rounded-xl border border-white/8 bg-white/[0.015]">
          <div className="flex-shrink-0 flex items-center justify-center w-14 h-14">{b.svg}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-white text-sm font-semibold">{b.name}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/8 text-white/42">default mass {b.mass}</span>
            </div>
            <SD>{b.desc}</SD>
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-white/10 p-4 bg-white/[0.015]">
        <p className="text-white/72 text-xs font-semibold mb-1.5">Collision rules</p>
        <SD>
          The <span className="text-white/72">heavier body always survives</span>, independent of which was placed first.
          The merged body keeps 72% of the combined momentum (28% radiates as heat). Asteroids only produce a small
          sparkle when absorbed — heavier collisions eject 3–8 debris asteroids outward.
        </SD>
      </div>
    </div>
  )
}

const PRESET_DATA = [
  { name: 'binary',    label: 'Binary Stars',     diagram: <BinaryDiagram />,         desc: 'Two equal-mass stars orbiting their shared center of mass. A classic two-body problem with a stable, periodic analytical solution.' },
  { name: 'solar',     label: 'Solar System',     diagram: <SolarDiagram />,          desc: 'A pinned central star with 5 planets on circular orbits. Initial velocities are set to the exact circular-orbit speed v = √(G·M/r) for each radius.' },
  { name: 'figure8',   label: 'Figure-8',         diagram: <Figure8Diagram />,        desc: 'The Chenciner–Montgomery choreography — three equal masses chasing each other along a figure-8 path. Mathematically exact and scaled from the G = 1 solution.' },
  { name: 'slingshot', label: 'Slingshot',        diagram: <SlingshotDiagram />,      desc: '12 asteroids fly past a pinned massive planet on near-hyperbolic trajectories. They get deflected and catapulted outward — the same gravity-assist physics used by real space probes.' },
  { name: 'blackhole', label: 'Black Hole Field', diagram: <BlackHoleFieldDiagram />, desc: '24 asteroids in randomised eccentric orbits around a central singularity. Most spiral in; a few may escape after close gravitational slingshots.' },
  { name: 'galaxy',    label: 'Galaxy Collision', diagram: <GalaxyDiagram />,         desc: 'Two mini-galaxies (each a black hole + 4 orbiters) approaching at constant speed. Their mutual gravity tears both systems apart over time.' },
  { name: 'chaos',     label: '3-Body Chaos',     diagram: <ChaosDiagram />,          desc: 'Three equal stars in an equilateral triangle. One gets a 9% velocity boost — just enough to break symmetry and send the system into deterministic chaos.' },
  { name: 'trojan',    label: 'Trojans',          diagram: <TrojanDiagram />,         desc: 'A planet shares its orbit with two asteroid clusters at the stable L4 (+60°) and L5 (−60°) Lagrange points — mirroring Jupiter\'s Trojan asteroids in our solar system.' },
  { name: 'rogue',     label: 'Rogue Star',       diagram: <RogueDiagram />,          desc: 'A stable 4-planet solar system is invaded by a rogue star on a hyperbolic trajectory. Planets scatter, get captured, or are ejected depending on the encounter.' },
  { name: 'quadruple', label: 'Double Binary',    diagram: <QuadrupleDiagram />,      desc: 'Two tight stellar pairs orbit each other — a hierarchical quadruple. All four velocities are computed analytically so both inner pairs and the outer orbit are stable simultaneously.' },
  { name: 'pulsar',    label: 'Pulsar',           diagram: <PulsarDiagram />,         desc: 'A massive black hole with a fast-orbiting companion star, plus 10 asteroids on highly eccentric orbits that bring them close to the event horizon.' },
]

function PresetsTab() {
  return (
    <div className="space-y-3">
      <SD>Click any preset in the toolbar to instantly load it. Presets replace all current bodies — use <span className="text-white/68">Share</span> first if you want to save your current state.</SD>
      <div className="space-y-2.5 mt-4">
        {PRESET_DATA.map(p => (
          <div key={p.name} className="flex gap-4 items-start p-3.5 rounded-xl border border-white/8 bg-white/[0.015]">
            <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center bg-black/50 rounded-xl">
              {p.diagram}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-white/85 text-xs font-semibold mb-1">{p.label}</p>
              <SD>{p.desc}</SD>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Code({ children }: { children: ReactNode }) {
  return (
    <div className="bg-black/60 border border-white/10 rounded-lg px-4 py-3 font-mono text-xs text-white/72 my-3 leading-relaxed">
      {children}
    </div>
  )
}

function PhysicsTab() {
  return (
    <div className="space-y-6">
      <div>
        <SH>Newton's Law of Universal Gravitation</SH>
        <SD>Every body attracts every other body each frame. The force between any two masses is:</SD>
        <Code>F = G × m₁ × m₂ / (d² + ε)</Code>
        <SD>
          <span className="text-white/68">G</span> is the gravitational constant (adjustable via slider, default 6.674).{' '}
          <span className="text-white/68">ε = 50</span> is a softening factor that prevents the force from blowing up
          when bodies pass very close — near-misses become slingshots instead of singularities.
          Force becomes acceleration via F = ma.
        </SD>
      </div>

      <div>
        <SH>Velocity Verlet Integration</SH>
        <SD>
          Simple Euler integration bleeds energy — orbits spiral inward over time. Velocity Verlet is
          symplectic (energy-conserving), so stable orbits stay stable indefinitely:
        </SD>
        <Code>
          x &nbsp;&nbsp;+= vx·dt + ½·ax·dt²<br/>
          ax_new = recompute all forces<br/>
          vx &nbsp;+= ½·(ax_old + ax_new)·dt
        </Code>
        <SD>
          Each step averages old and new accelerations when updating velocity. This keeps the total mechanical
          energy bounded over thousands of frames, unlike first-order Euler.
        </SD>
      </div>

      <div>
        <SH>Collision System</SH>
        <div className="rounded-xl border border-white/10 overflow-hidden mt-2">
          {[
            ['Detection',    'Two bodies overlap when distance < 75% of their combined radii'],
            ['Survivor',     'The heavier body always wins, regardless of placement order'],
            ['Momentum',     'Merged body gets 72% of combined momentum — 28% radiates as heat'],
            ['Black holes',  'A BH absorbing a lighter body keeps its own velocity unchanged'],
            ['BH + Star',    '~4 second spiral-in animation before the star crosses the event horizon'],
            ['Star + Star',  'Supernova: expanding nebula ring, 6 shockwave rings, 70 sparks, fireballs'],
            ['Debris',       '3–8 asteroids are ejected outward from major (non-asteroid) collisions'],
          ].map(([k, v], i) => <Row key={i} label={k} value={v} alt={i % 2 === 0} />)}
        </div>
      </div>

      <div>
        <SH>Performance</SH>
        <SD>
          The simulation is O(n²) — every body interacts with every other body every frame. Capped at
          45 bodies and 300 particles to maintain frame rate. Use the <span className="text-white/68">Speed slider</span> to
          run at up to 5× real-time, or slow to 0.1× to study close encounters in detail.
        </SD>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('controls')
  const tabs: { key: Tab; label: string }[] = [
    { key: 'controls', label: 'Controls' },
    { key: 'bodies',   label: 'Bodies'   },
    { key: 'presets',  label: 'Presets'  },
    { key: 'physics',  label: 'Physics'  },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#0d0d1f] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base leading-tight">Gravity Sandbox — Guide</h2>
            <p className="text-white/36 text-[11px] mt-1">N-body physics · Velocity Verlet · Newton's law of gravitation</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/38 hover:text-white hover:bg-white/10 transition-colors text-xl leading-none ml-4 flex-shrink-0 mt-0.5"
          >×</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/10 flex-shrink-0">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${
                tab === key
                  ? 'text-white border-b-2 border-white/55'
                  : 'text-white/36 hover:text-white/62'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          {tab === 'controls' && <ControlsTab />}
          {tab === 'bodies'   && <BodiesTab />}
          {tab === 'presets'  && <PresetsTab />}
          {tab === 'physics'  && <PhysicsTab />}
        </div>
      </div>
    </div>
  )
}
