'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Body, BodyType, defaultColor, defaultMass, defaultRadius, predictPath, step } from '@/lib/physics'
import { draw, DragState, Particle, AbsorptionAnim, SupernovaAnim } from '@/lib/renderer'
import {
  Viewport, MIN_ZOOM, MAX_ZOOM, canvasCssSize, eventToCanvas, findBodyAt, frameToFit, screenToWorld,
  worldToScreen, zoomAt,
} from '@/lib/camera'
import {
  GESTURE, Gesture, PointerState, CancelReason, distance,
  TAP_MAX_PX, LONG_PRESS_MS, LONG_PRESS_MAX_PX, MAX_SPAWN_SPEED, InteractionMode,
} from '@/lib/gestures'
import { encodeBodies, decodeBodies } from '@/lib/serialize'
import { PRESETS, PresetName } from '@/lib/presets'
import { newId } from '@/lib/utils'
import { useNativeShell } from '@/lib/use-native-shell'
import Toolbar, { SheetName, SettingsSheetBody, BODY_TYPES, PRESET_LIST } from './toolbar'
import Sheet from './sheet'
import BodyTooltip from './body-tooltip'
import HelpModal from './help-modal'
import BodyEditor, { EditingBodyState } from './body-editor'

const VELOCITY_SCALE = 0.05
const MAX_BODIES = 45
const MAX_PARTICLES = 300
const MAX_HISTORY = 300
// Rotation on Android fires a burst of resize events; coalesce them.
const RESIZE_DEBOUNCE_MS = 150
const PREVIEW_COLORS: Record<BodyType, string> = {
  star: '#FFD700', planet: '#4fa3e0', blackhole: '#9944ff', asteroid: '#9a9a9a',
}

export default function GravitySandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Physics state kept in refs for the rAF loop (no React re-render cost)
  const bodiesRef = useRef<Body[]>([])
  const isRunningRef = useRef(true)
  const GRef = useRef(6.674)
  const speedRef = useRef(1)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const dragRef = useRef<DragState | null>(null)
  const hoveredIdRef = useRef<string | null>(null)
  // dpr stays 1 for now; Phase 5 caps it at Math.min(devicePixelRatio, 2). It lives
  // in the viewport so the camera helpers own the CSS-px ↔ device-px boundary.
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1, dpr: 1 })
  // Body being dragged (moves an existing body, sim pauses)
  const bodyDragRef = useRef<{ id: string; offsetX: number; offsetY: number; wasRunning: boolean } | null>(null)
  // Middle-mouse pan state
  const panRef = useRef<{ startX: number; startY: number; vpX: number; vpY: number } | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const absorptionsRef = useRef<AbsorptionAnim[]>([])
  const supernovasRef = useRef<SupernovaAnim[]>([])
  const predictedRef = useRef<{ path: { x: number; y: number }[]; color: string } | null>(null)
  const historyRef = useRef<Body[][]>([])
  const isRewindingRef = useRef(false)
  const followIdRef = useRef<string | null>(null)
  const followedTypeRef = useRef<BodyType | null>(null)
  const shakeRef = useRef({ x: 0, y: 0 })
  const bodyDragMovedRef = useRef(false)
  const editingIdRef = useRef<string | null>(null)
  // Set by the rAF effect so lifecycle events (visibilitychange, Capacitor
  // pause/resume) can halt and restart the loop without double-starting it.
  const loopControlRef = useRef<{ start: () => void; stop: () => void } | null>(null)

  // Mirror selectedType in a ref so pointer handlers never read a stale value
  const selectedTypeRef = useRef<BodyType>('planet')

  // Single-pointer default. Two-finger gestures bypass it entirely, and middle-drag
  // still pans on desktop. The visible toggle for this arrives in Phase 3b-3.
  const interactionModeRef = useRef<InteractionMode>('spawn')

  // Gesture machine state. Declared here, with the other refs, because the rAF loop
  // reads gestureRef and closures created before a ref is declared are treated as
  // capturing a frozen value.
  const gestureRef = useRef<Gesture>(GESTURE.IDLE)
  const pointersRef = useRef<Map<number, PointerState>>(new Map())
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set when a gesture is discarded. Both reasons discard; kept apart for debugging.
  const cancelReasonRef = useRef<CancelReason | null>(null)
  // Input type of the most recent pointerdown, so dblclick (a MouseEvent, which
  // carries no pointerType) can tell a real double-click from a synthesised one.
  const lastPointerTypeRef = useRef<string>('mouse')

  // React state for UI only
  const [selectedType, setSelectedType] = useState<BodyType>('planet')
  useEffect(() => { selectedTypeRef.current = selectedType }, [selectedType])
  const [isRunning, setIsRunning] = useState(true)
  const [G, setGState] = useState(6.674)
  const [speed, setSpeedState] = useState(1)
  const [hoveredBody, setHoveredBody] = useState<Body | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [bodyCount, setBodyCount] = useState(0)
  const [shareCopied, setShareCopied] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [cursor, setCursor] = useState<string>('crosshair')
  const [isRewinding, setIsRewinding] = useState(false)
  const [followedBody, setFollowedBody] = useState<BodyType | null>(null)
  const [editingBody, setEditingBody] = useState<EditingBodyState | null>(null)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('spawn')
  // Which body the camera is following, as state so the editor can show it.
  const [followedId, setFollowedId] = useState<string | null>(null)
  const [openSheet, setOpenSheet] = useState<SheetName | null>(null)
  useEffect(() => { interactionModeRef.current = interactionMode }, [interactionMode])

  // Canvas-local CSS coords for a mouse event, then the world point under it.
  const eventWorld = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!
    const { x, y } = eventToCanvas(e, canvas)
    return screenToWorld(x, y, viewportRef.current)
  }, [])

  /**
   * Resize the backing store and keep the same world point under the centre.
   *
   * One of only two places that touch device pixels (the other is setTransform in
   * draw). Shared by the resize listener and by mount, which needs the canvas
   * sized before it can frame the camera to a hash-loaded scene.
   *
   * ── COORDINATE-SPACE BOUNDARY. READ BEFORE CHANGING. ──────────────────────
   * The canvas is measured from its own LAYOUT box (getBoundingClientRect), not
   * from window.visualViewport. Pointer events' clientX/clientY and
   * document.elementFromPoint — which the gesture machine and the spawn dead zone
   * both depend on — are expressed in layout-viewport coordinates. visualViewport
   * is a different space: it shifts and shrinks when the on-screen keyboard opens
   * or the page is pinch-zoomed. Sizing the canvas from visualViewport while
   * hit-testing in layout coordinates makes the two diverge, and every tap lands
   * at the wrong world point with no visible cause.
   *
   * visualViewport is therefore used ONLY as an extra resize *signal* (Android
   * fires it in cases window resize misses); the dimensions always come from the
   * layout box, which is the same source of truth eventToCanvas uses.
   */
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const vp = viewportRef.current
    const { dpr } = vp

    const rect = canvas.getBoundingClientRect()
    const cssW = rect.width || window.innerWidth
    const cssH = rect.height || window.innerHeight

    // Previous CSS size, recovered from the backing store: the layout box has
    // already updated by the time this runs, so the old size is only still
    // available here.
    const prevW = canvas.width / dpr
    const prevH = canvas.height / dpr

    const nextW = Math.round(cssW * dpr)
    const nextH = Math.round(cssH * dpr)
    if (canvas.width === nextW && canvas.height === nextH) return

    // Hold the world-space centre across the resize, so rotating the device keeps
    // the same part of the simulation in view instead of sliding the camera.
    const hadSize = prevW > 0 && prevH > 0
    const centre = hadSize ? screenToWorld(prevW / 2, prevH / 2, vp) : null

    canvas.width = nextW
    canvas.height = nextH

    if (centre) {
      viewportRef.current = {
        ...vp,
        x: cssW / 2 - centre.x * vp.scale,
        y: cssH / 2 - centre.y * vp.scale,
      }
    }
  }, [])

  // Zoom about a canvas-local CSS pivot, keeping that world point anchored.
  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    const next = zoomAt(viewportRef.current, factor, cx, cy)
    viewportRef.current = next
    setZoom(next.scale)
  }, [])

  // Main rAF loop: physics + render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Must precede framing: the resize effect is declared later and so runs later.
    sizeCanvas()

    const hash = window.location.hash.slice(1)
    if (hash) {
      const decoded = decodeBodies(hash)
      if (decoded.length > 0) {
        bodiesRef.current = decoded
        setBodyCount(decoded.length)
        // Shared links carry absolute world coordinates but no camera, so a link
        // authored on a desktop used to open with its bodies off-screen on a phone.
        // Framing on load makes an existing link render correctly on any device
        // without changing the encoding.
        viewportRef.current = frameToFit(
          decoded,
          canvasCssSize(canvas, viewportRef.current),
          viewportRef.current
        )
        setZoom(viewportRef.current.scale)
      }
    }

    lastTimeRef.current = performance.now()

    function tick(timestamp: number) {
      const delta = Math.min(timestamp - lastTimeRef.current, 100)
      lastTimeRef.current = timestamp

      const dt = (delta / 16.667) * speedRef.current

      if (isRewindingRef.current) {
        if (historyRef.current.length > 0) {
          const snapshot = historyRef.current.pop()!
          bodiesRef.current = snapshot
          setBodyCount(snapshot.length)
        }
        particlesRef.current = []
        absorptionsRef.current = []
        supernovasRef.current = []
        predictedRef.current = null
      }

      if (!isRewindingRef.current && isRunningRef.current && delta > 0) {
        historyRef.current.push(bodiesRef.current.map(b => ({ ...b, trail: [] })))
        if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
        const { bodies, collisions } = step(bodiesRef.current, GRef.current, dt)
        bodiesRef.current = bodies

        for (const ev of collisions) {
          // Supernova: star + star collision — unique massive explosion
          if (ev.absorberType === 'star' && ev.absorbedType === 'star') {
            const R = ev.radius
            const px = particlesRef.current

            // Massive screen shake
            const sn = 45
            shakeRef.current.x += (Math.random() - 0.5) * sn * 2
            shakeRef.current.y += (Math.random() - 0.5) * sn * 2

            // Persistent expanding nebula ring
            supernovasRef.current.push({
              x: ev.x, y: ev.y,
              color: ev.color,
              life: 1, decay: 0.003,
              maxRadius: 360 + R * 3,
            })

            // Three sequential flash layers — core, expanding halo, outer bloom
            px.push({ kind: 'flash', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 1,   decay: 0.07,  color: '#ffffff',  size: R * 5   })
            px.push({ kind: 'flash', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 0.8, decay: 0.04,  color: ev.color,   size: R * 11  })
            px.push({ kind: 'flash', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 0.5, decay: 0.022, color: '#ff8844',  size: R * 20  })

            // Six shockwave rings at different sizes and speeds
            for (let ri = 0; ri < 6; ri++) {
              px.push({
                kind: 'shockwave', x: ev.x, y: ev.y, vx: 0, vy: 0,
                life: 1 - ri * 0.07, decay: 0.016 + ri * 0.007,
                color: ri < 2 ? '#ffffff' : ri < 4 ? ev.color : '#aa88ff',
                size: 0, startRadius: R * 0.4,
                endRadius: 120 + ri * 90,
              })
            }

            // 70 sparks — dense radial burst
            for (let i = 0; i < 70; i++) {
              const a = Math.random() * Math.PI * 2
              const spd = 3 + Math.random() * 14
              const c = Math.random() < 0.25 ? '#ffffff' : Math.random() < 0.45 ? '#ffee66' : Math.random() < 0.6 ? ev.color : '#ffaa44'
              px.push({ kind: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 1, decay: 0.01 + Math.random() * 0.018, color: c, size: 0.8 + Math.random() * 1.6 })
            }

            // 22 large fireballs in supernova palette (white-hot → orange-red)
            const snFireColors = ['#ffffff', '#ffffcc', '#ffee55', '#ffbb22', '#ff7700', '#ff3300', ev.color]
            for (let i = 0; i < 22; i++) {
              const a = Math.random() * Math.PI * 2
              const spd = 1 + Math.random() * 4.5
              px.push({
                kind: 'fire',
                x: ev.x + (Math.random() - 0.5) * R, y: ev.y + (Math.random() - 0.5) * R,
                vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                life: 1, decay: 0.01 + Math.random() * 0.014,
                color: snFireColors[Math.floor(Math.random() * snFireColors.length)],
                size: R * 0.7 + Math.random() * R * 1.3,
              })
            }

            // 12 large nebula clouds — purple, blue, teal (real nebula colors)
            const nebulaColors = ['#9944cc', '#4488ff', '#44ccff', '#ff6644', '#cc44aa']
            for (let i = 0; i < 12; i++) {
              const a = Math.random() * Math.PI * 2
              const spd = 0.3 + Math.random() * 1.4
              px.push({
                kind: 'smoke',
                x: ev.x + (Math.random() - 0.5) * R * 2, y: ev.y + (Math.random() - 0.5) * R * 2,
                vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                life: 1, decay: 0.003 + Math.random() * 0.004,
                color: nebulaColors[Math.floor(Math.random() * nebulaColors.length)],
                size: R * 2 + Math.random() * R * 2.5,
              })
            }

            // Debris asteroids ejected from the explosion
            if (bodiesRef.current.length < MAX_BODIES) {
              const debrisColors = ['#9a9a9a', '#8b8075', '#a09488', '#b0a89a']
              const debrisCount = 5 + Math.floor(Math.random() * 4)
              const newDebris: Body[] = []
              for (let i = 0; i < debrisCount; i++) {
                const a = Math.random() * Math.PI * 2
                const ejectSpeed = 7 + Math.random() * 14
                const spawnDist = R * 2.5 + Math.random() * R * 3
                const mass = 2 + Math.random() * 6
                newDebris.push({
                  id: newId(), type: 'asteroid',
                  x: ev.x + Math.cos(a) * spawnDist, y: ev.y + Math.sin(a) * spawnDist,
                  vx: ev.vx + Math.cos(a) * ejectSpeed, vy: ev.vy + Math.sin(a) * ejectSpeed,
                  ax: 0, ay: 0, prevAx: 0, prevAy: 0,
                  mass, radius: Math.max(3, defaultRadius(mass, 'asteroid')),
                  trail: [], color: debrisColors[Math.floor(Math.random() * debrisColors.length)], pinned: false,
                })
              }
              bodiesRef.current = [...bodiesRef.current, ...newDebris]
              setBodyCount(c => c + newDebris.length)
            }
            continue
          }

          // Black hole absorbing a star → slow spiral-in animation, skip normal explosion
          if (ev.absorberType === 'blackhole' && ev.absorbedType === 'star') {
            const initAngle = Math.atan2(ev.absorbedY - ev.y, ev.absorbedX - ev.x)
            const initDist = Math.hypot(ev.absorbedX - ev.x, ev.absorbedY - ev.y)
            absorptionsRef.current.push({
              bhId: ev.survivorId,
              bhX: ev.x, bhY: ev.y,
              starColor: ev.absorbedColor,
              startRadius: ev.radius,
              angle: initAngle,
              orbitRadius: Math.max(ev.radius * 4, initDist),
              life: 1, decay: 0.004,
              trail: [],
              flashSpawned: false,
            })
            continue
          }

          // Cap visual R so a large star doesn't produce screen-filling effects
          const R = Math.max(8, Math.min(ev.radius, 32))
          const ss = Math.max(0.5, Math.min(ev.relativeSpeed * 0.15, 2.5))
          const px = particlesRef.current

          // Screen shake — capped so it's never nauseating
          const shakeAmt = Math.min(14, R * 0.25 + ev.relativeSpeed * 0.3)
          shakeRef.current.x += (Math.random() - 0.5) * shakeAmt * 2
          shakeRef.current.y += (Math.random() - 0.5) * shakeAmt * 2

          if (px.length < MAX_PARTICLES && !ev.spawnDebris) {
            // Asteroid absorbed by a larger body — tiny sparkle only
            for (let i = 0; i < 4; i++) {
              const a = Math.random() * Math.PI * 2
              px.push({ kind: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * (1 + Math.random() * 2), vy: Math.sin(a) * (1 + Math.random() * 2), life: 1, decay: 0.08, color: '#aaaaaa', size: 0.6 })
            }
          }
          if (px.length < MAX_PARTICLES && ev.spawnDebris) {
            // Flash bloom — absolute pixel cap so it doesn't swallow the screen
            px.push({ kind: 'flash', x: ev.x, y: ev.y, vx: 0, vy: 0, life: 1, decay: 0.1, color: ev.color, size: Math.min(R * 2.5, 75) })

            // Shockwave rings — end radii are hard-capped in pixels
            for (let r = 0; r < 2; r++) {
              px.push({
                kind: 'shockwave', x: ev.x, y: ev.y, vx: 0, vy: 0,
                life: 1, decay: 0.04 + r * 0.015,
                color: r === 0 ? '#ffffff' : ev.color,
                size: 0, startRadius: R * 0.2,
                endRadius: Math.min(R * (2.5 + r * 1.8), 80 + r * 90),
              })
            }

            // Sparks
            const sparkCount = 14 + Math.floor(Math.random() * 6)
            for (let i = 0; i < sparkCount; i++) {
              const angle = Math.random() * Math.PI * 2
              const spd = (2 + Math.random() * 7) * ss
              px.push({
                kind: 'spark', x: ev.x, y: ev.y,
                vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                life: 1, decay: 0.028 + Math.random() * 0.03,
                color: Math.random() < 0.4 ? '#ffffff' : Math.random() < 0.5 ? '#ffdd66' : ev.color,
                size: 0.7 + Math.random() * 1.2,
              })
            }

            // Fire
            const fireColors = ['#ffee55', '#ffbb22', '#ff7700', '#ff4400', ev.color]
            const fireCount = 7 + Math.floor(Math.random() * 4)
            for (let i = 0; i < fireCount; i++) {
              const angle = Math.random() * Math.PI * 2
              px.push({
                kind: 'fire',
                x: ev.x + (Math.random() - 0.5) * R * 0.6,
                y: ev.y + (Math.random() - 0.5) * R * 0.6,
                vx: Math.cos(angle) * (0.6 + Math.random() * 2.5) * ss,
                vy: Math.sin(angle) * (0.6 + Math.random() * 2.5) * ss,
                life: 1, decay: 0.025 + Math.random() * 0.02,
                color: fireColors[Math.floor(Math.random() * fireColors.length)],
                size: Math.min(R * 0.4 + Math.random() * R * 0.5, 28),
              })
            }

            // Smoke
            for (let i = 0; i < 3; i++) {
              const angle = Math.random() * Math.PI * 2
              px.push({
                kind: 'smoke',
                x: ev.x + (Math.random() - 0.5) * R,
                y: ev.y + (Math.random() - 0.5) * R,
                vx: Math.cos(angle) * (0.2 + Math.random() * 0.7),
                vy: Math.sin(angle) * (0.2 + Math.random() * 0.7) - 0.15,
                life: 1, decay: 0.009 + Math.random() * 0.006,
                color: '#778',
                size: Math.min(R * 0.6 + Math.random() * R * 0.8, 35),
              })
            }
          }

          // Debris asteroids — only non-asteroid collisions, only under the body cap
          if (!ev.spawnDebris || bodiesRef.current.length >= MAX_BODIES) continue
          const debrisColors = ['#9a9a9a', '#8b8075', '#a09488', '#7a7870', '#b0a89a']
          const debrisCount = 3 + Math.floor(Math.random() * 3)
          const newDebris: Body[] = []
          for (let i = 0; i < debrisCount; i++) {
            const angle = Math.random() * Math.PI * 2
            // High enough to clear the merged body's gravity well at close range
            const ejectSpeed = 4 + Math.random() * 7 + ss * 3
            // Spawn well outside the merged body's radius so no instant re-collision
            const spawnDist = Math.max(ev.radius + 18, R * (2.0 + Math.random() * 2.0))
            const mass = 2 + Math.random() * 5
            newDebris.push({
              id: newId(),
              type: 'asteroid',
              x: ev.x + Math.cos(angle) * spawnDist,
              y: ev.y + Math.sin(angle) * spawnDist,
              vx: ev.vx + Math.cos(angle) * ejectSpeed,
              vy: ev.vy + Math.sin(angle) * ejectSpeed,
              ax: 0, ay: 0, prevAx: 0, prevAy: 0,
              mass,
              radius: Math.max(3, defaultRadius(mass, 'asteroid')),
              trail: [],
              color: debrisColors[Math.floor(Math.random() * debrisColors.length)],
              pinned: false,
            })
          }
          bodiesRef.current = [...bodiesRef.current, ...newDebris]
          setBodyCount(c => c + newDebris.length)
        }
      }

      // Re-project the spawn endpoint from the pointer's screen position every frame.
      // The anchor is world-space and fixed, but the endpoint must track the cursor
      // even when the camera moves without the pointer moving (wheel zoom mid-drag),
      // otherwise the arrow detaches and the launch uses a stale delta.
      if (dragRef.current) {
        const d = dragRef.current
        const w = screenToWorld(d.lastScreenX, d.lastScreenY, viewportRef.current)
        d.currentX = w.x
        d.currentY = w.y
      }

      // Predicted orbit preview — fading dots showing where a new body will travel
      if (!isRewindingRef.current) {
        if (dragRef.current && !bodyDragRef.current) {
          const drag = dragRef.current
          const type = selectedTypeRef.current
          const mass = defaultMass(type)
          predictedRef.current = {
            path: predictPath(bodiesRef.current, {
              x: drag.startX, y: drag.startY,
              vx: (drag.currentX - drag.startX) * VELOCITY_SCALE,
              vy: (drag.currentY - drag.startY) * VELOCITY_SCALE,
              mass, radius: defaultRadius(mass, type),
            }, GRef.current),
            color: PREVIEW_COLORS[type],
          }
        } else {
          predictedRef.current = null
        }
      }

      // Step absorption animations — track the BH as it moves, spiral the ghost inward
      for (const a of absorptionsRef.current) {
        const bh = bodiesRef.current.find(b => b.id === a.bhId)
        if (bh) { a.bhX = bh.x; a.bhY = bh.y }
        const progress = 1 - a.life
        a.angle += (0.06 + progress * 0.35) * dt        // accelerates as orbit tightens
        a.orbitRadius *= Math.pow(0.990, dt)             // exponential inspiral
        a.life -= a.decay * dt
        const gx = a.bhX + Math.cos(a.angle) * a.orbitRadius
        const gy = a.bhY + Math.sin(a.angle) * a.orbitRadius
        a.trail.push({ x: gx, y: gy })
        if (a.trail.length > 55) a.trail.shift()
        // Final flash as the star disappears into the horizon
        if (!a.flashSpawned && a.life < 0.12) {
          a.flashSpawned = true
          particlesRef.current.push({
            kind: 'flash', x: a.bhX, y: a.bhY, vx: 0, vy: 0,
            life: 1, decay: 0.055, color: a.starColor,
            size: a.startRadius * 2.5,
          })
        }
      }
      absorptionsRef.current = absorptionsRef.current.filter(a => a.life > 0)

      for (const s of supernovasRef.current) s.life -= s.decay * dt
      supernovasRef.current = supernovasRef.current.filter(s => s.life > 0)

      // Decay shake and tick + cull particles every frame
      shakeRef.current.x *= 0.82
      shakeRef.current.y *= 0.82

      particlesRef.current = particlesRef.current
        .map(p => ({
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          vx: p.vx * (p.kind === 'spark' ? 0.94 : p.kind === 'smoke' ? 0.99 : 0.96),
          vy: p.vy * (p.kind === 'spark' ? 0.94 : p.kind === 'smoke' ? 0.99 : 0.96),
          life: p.life - p.decay * dt,
        }))
        .filter(p => p.life > 0)

      // Follow camera — lock viewport to center on the followed body each frame.
      // Suspended during a spawn drag: aiming at a target while the world slides
      // under the anchor makes the launch impossible to control.
      if (followIdRef.current && gestureRef.current !== GESTURE.SPAWNING) {
        const fb = bodiesRef.current.find(b => b.id === followIdRef.current)
        if (fb) {
          if (fb.type !== followedTypeRef.current) {
            followedTypeRef.current = fb.type
            setFollowedBody(fb.type)
          }
          const { width, height } = canvasCssSize(canvas!, viewportRef.current)
          viewportRef.current = {
            ...viewportRef.current,
            x: width / 2 - fb.x * viewportRef.current.scale,
            y: height / 2 - fb.y * viewportRef.current.scale,
          }
        } else {
          followIdRef.current = null
          followedTypeRef.current = null
          setFollowedBody(null)
          setFollowedId(null)
        }
      }

      const ctx = canvas!.getContext('2d')
      if (ctx) {
        // Screen shake is RENDER-ONLY. It is applied to a throwaway copy of the
        // viewport and never written back to viewportRef, so screenToWorld /
        // worldToScreen / findBodyAt all keep operating in unshaken world space and
        // hit-testing stays aligned with where the user thinks bodies are. Do not
        // fold this offset into the camera helpers.
        const vp = viewportRef.current
        const shakeViewport = {
          ...vp,
          x: vp.x + shakeRef.current.x,
          y: vp.y + shakeRef.current.y,
        }
        draw(ctx, bodiesRef.current, particlesRef.current, absorptionsRef.current, supernovasRef.current, predictedRef.current, dragRef.current, hoveredIdRef.current, shakeViewport)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    // Guarded so the loop can never be started twice. Android can deliver both
    // visibilitychange and the Capacitor pause/resume pair for the same transition;
    // without the guard that would leave two rAF loops running at double speed.
    let loopRunning = false

    const startLoop = () => {
      if (loopRunning) return
      loopRunning = true
      // Reset the frame timer rather than integrating the backgrounded gap.
      lastTimeRef.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    }

    const stopLoop = () => {
      if (!loopRunning) return
      loopRunning = false
      cancelAnimationFrame(rafRef.current)
    }

    startLoop()
    loopControlRef.current = { start: startLoop, stop: stopLoop }

    const urlTimer = setInterval(() => {
      if (bodiesRef.current.length > 0) {
        window.location.hash = encodeBodies(bodiesRef.current)
      }
    }, 2000)

    const onVisibility = () => {
      if (document.hidden) stopLoop()
      else startLoop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopLoop()
      loopControlRef.current = null
      clearInterval(urlTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [sizeCanvas])

  // Resize canvas to fill the window
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    sizeCanvas()

    // Debounced: Android fires a burst of resizes through a rotation, and
    // reallocating the backing store on each one is both slow and visibly janky.
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; sizeCanvas() }, RESIZE_DEBOUNCE_MS)
    }

    window.addEventListener('resize', debounced)
    window.addEventListener('orientationchange', debounced)
    // Signal only — see the coordinate-space note on sizeCanvas. Android reports
    // some transitions here that never reach the window resize event.
    window.visualViewport?.addEventListener('resize', debounced)

    return () => {
      if (timer !== null) clearTimeout(timer)
      window.removeEventListener('resize', debounced)
      window.removeEventListener('orientationchange', debounced)
      window.visualViewport?.removeEventListener('resize', debounced)
    }
  }, [sizeCanvas])

  // Non-passive wheel listener so we can prevent page zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { x: cx, y: cy } = eventToCanvas(e, canvas)
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      applyZoom(factor, cx, cy)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [applyZoom])


  // Global pointerup safety net — cleans up drag/pan if the pointer is released
  // outside the canvas. Pointer capture makes this mostly redundant now, but it is
  // kept as a backstop for the case where capture is lost (the browser can revoke
  // it), and because removing it would be a behaviour change in its own right.
  // (defined below, after the gesture callbacks it depends on)

  // Rewind is driven by both the hold-to-rewind button and the R key; one impl.
  const startRewind = useCallback(() => { isRewindingRef.current = true; setIsRewinding(true) }, [])
  const stopRewind = useCallback(() => { isRewindingRef.current = false; setIsRewinding(false) }, [])

  // Keyboard: hold R to rewind. Escape is handled separately, below, because it
  // shares the hardware back button's precedence chain.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'r' || e.key === 'R') startRewind()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') stopRewind()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [startRewind, stopRewind])

  // ── Pointer input: one state machine for mouse, pen and touch ───────────────
  //
  // See src/lib/gestures.ts for the enum and the full transition table. Every state
  // change goes through setGesture so the machine stays inspectable; nothing here
  // infers a gesture from a combination of booleans.

  const clearLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  /** Release a grabbed body, restoring the run state captured when the grab began. */
  const releaseGrab = useCallback(() => {
    const grab = bodyDragRef.current
    if (!grab) return
    // Only resume a sim that was running before the grab — never resume one the
    // user had deliberately paused.
    isRunningRef.current = grab.wasRunning
    bodyDragRef.current = null
  }, [])

  /**
   * Abandon whatever single-pointer gesture is in progress without committing it.
   * A half-drawn spawn arrow disappears; a grabbed body stays exactly where it is
   * now, because the sim is paused during a grab and its current position is the
   * user's own deliberate placement.
   */
  const discardActiveGesture = useCallback((reason: CancelReason) => {
    cancelReasonRef.current = reason
    clearLongPress()
    dragRef.current = null
    predictedRef.current = null
    panRef.current = null
    releaseGrab()
  }, [clearLongPress, releaseGrab])

  /** Reset to IDLE. Called whenever the pointer map empties. */
  const resetToIdle = useCallback(() => {
    clearLongPress()
    pinchRef.current = null
    dragRef.current = null
    predictedRef.current = null
    panRef.current = null
    releaseGrab()
    gestureRef.current = GESTURE.IDLE
  }, [clearLongPress, releaseGrab])

  const beginPinch = useCallback(() => {
    const [a, b] = [...pointersRef.current.values()]
    if (!a || !b) return
    pinchRef.current = {
      dist: distance(a.curX, a.curY, b.curX, b.curY),
      midX: (a.curX + b.curX) / 2,
      midY: (a.curY + b.curY) / 2,
    }
    gestureRef.current = GESTURE.PINCHING
  }, [])

  const startSpawn = useCallback((p: PointerState) => {
    const w = screenToWorld(p.startX, p.startY, viewportRef.current)
    editingIdRef.current = null
    setEditingBody(null)
    dragRef.current = {
      startX: w.x, startY: w.y,
      currentX: w.x, currentY: w.y,
      // Canvas CSS position of the pointer, re-projected every frame so the arrow
      // tracks the cursor even when the camera moves under it (wheel zoom).
      lastScreenX: p.curX, lastScreenY: p.curY,
    }
    gestureRef.current = GESTURE.SPAWNING
  }, [])

  const startPan = useCallback((p: PointerState) => {
    followIdRef.current = null
    followedTypeRef.current = null
    setFollowedBody(null)
    setFollowedId(null)
    panRef.current = {
      startX: p.curX, startY: p.curY,
      vpX: viewportRef.current.x, vpY: viewportRef.current.y,
    }
    gestureRef.current = GESTURE.PANNING
  }, [])

  const startGrab = useCallback((body: Body, p: PointerState) => {
    const w = screenToWorld(p.curX, p.curY, viewportRef.current)
    bodyDragRef.current = {
      id: body.id,
      offsetX: w.x - body.x,
      offsetY: w.y - body.y,
      wasRunning: isRunningRef.current,
    }
    bodyDragMovedRef.current = false
    isRunningRef.current = false
    setCursor('grabbing')
    gestureRef.current = GESTURE.GRABBING
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Best-effort: setPointerCapture throws when no active pointer has that id, and
    // letting it propagate would abort gesture setup and strand the machine.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no active pointer */ }
    lastPointerTypeRef.current = e.pointerType
    const { x, y } = eventToCanvas(e, e.currentTarget)
    pointersRef.current.set(e.pointerId, {
      id: e.pointerId, startX: x, startY: y, curX: x, curY: y, startTime: performance.now(),
    })

    // Two pointers always mean pinch, whatever was in progress and whatever mode
    // the app is in. The interrupted gesture is discarded, never committed.
    if (pointersRef.current.size >= 2) {
      discardActiveGesture('superseded')
      beginPinch()
      return
    }

    // A third-or-later pointer landing while LOCKED must not restart anything.
    if (gestureRef.current === GESTURE.LOCKED) return

    const p = pointersRef.current.get(e.pointerId)!
    cancelReasonRef.current = null

    // Middle button pans regardless of mode — unchanged desktop behaviour.
    if (e.pointerType !== 'touch' && e.button === 1) {
      e.preventDefault()
      startPan(p)
      return
    }
    if (e.pointerType !== 'touch' && e.button !== 0) return

    const w = screenToWorld(x, y, viewportRef.current)
    const hit = findBodyAt(bodiesRef.current, w.x, w.y, viewportRef.current)

    if (e.pointerType === 'touch') {
      // Touch cannot hover, so a single finger down is ambiguous between grabbing a
      // body and starting a pan/spawn. Stay undecided and let the thresholds decide.
      gestureRef.current = GESTURE.PENDING
      if (hit) {
        longPressRef.current = setTimeout(() => {
          longPressRef.current = null
          const still = pointersRef.current.get(e.pointerId)
          if (!still || gestureRef.current !== GESTURE.PENDING) return
          if (distance(still.startX, still.startY, still.curX, still.curY) > LONG_PRESS_MAX_PX) return
          const body = bodiesRef.current.find(b => b.id === hit.id)
          if (!body) return
          if ('vibrate' in navigator) {
            (navigator as Navigator & { vibrate: (n: number) => void }).vibrate(15)
          }
          startGrab(body, still)
        }, LONG_PRESS_MS)
      }
      return
    }

    // Mouse and pen resolve immediately: pressing on a body has always grabbed it,
    // and there is a hover cursor to signal it. Making desktop wait 400 ms would be
    // a regression, so PENDING is a touch-only state.
    if (hit) startGrab(hit, p)
    else if (interactionModeRef.current === 'pan') startPan(p)
    else startSpawn(p)
  }, [beginPinch, discardActiveGesture, startGrab, startPan, startSpawn])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointersRef.current.get(e.pointerId)
    const { x, y } = eventToCanvas(e, e.currentTarget)
    if (p) { p.curX = x; p.curY = y }

    const state = gestureRef.current

    if (state === GESTURE.PINCHING) {
      const [a, b] = [...pointersRef.current.values()]
      const pinch = pinchRef.current
      if (!a || !b || !pinch) return
      const dist = distance(a.curX, a.curY, b.curX, b.curY)
      const midX = (a.curX + b.curX) / 2
      const midY = (a.curY + b.curY) / 2
      if (pinch.dist <= 0) return

      // Zoom and two-finger pan solved together, exactly: take the world point under
      // the PREVIOUS midpoint and place it under the new one at the new scale.
      // Scaling about the new midpoint and then adding the midpoint delta separately
      // leaves an error of (mid1 - mid0) * (1 - factor), which shows up as the anchor
      // creeping out from under the fingers over a long pinch.
      const vp = viewportRef.current
      const anchor = screenToWorld(pinch.midX, pinch.midY, vp)
      const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.scale * (dist / pinch.dist)))
      viewportRef.current = {
        ...vp,
        scale,
        x: midX - anchor.x * scale,
        y: midY - anchor.y * scale,
      }
      setZoom(scale)
      pinchRef.current = { dist, midX, midY }
      return
    }

    // LOCKED deliberately ignores movement: a leftover finger after a pinch must not
    // start panning or spawning from a stale anchor.
    if (state === GESTURE.LOCKED) return

    if (state === GESTURE.PENDING && p) {
      if (distance(p.startX, p.startY, p.curX, p.curY) > TAP_MAX_PX) {
        clearLongPress()
        if (interactionModeRef.current === 'pan') startPan(p)
        else startSpawn(p)
      }
      return
    }

    const w = screenToWorld(x, y, viewportRef.current)

    if (state === GESTURE.PANNING && panRef.current) {
      viewportRef.current = {
        ...viewportRef.current,
        x: panRef.current.vpX + (x - panRef.current.startX),
        y: panRef.current.vpY + (y - panRef.current.startY),
      }
      return
    }

    if (state === GESTURE.GRABBING && bodyDragRef.current) {
      bodyDragMovedRef.current = true
      const { id, offsetX, offsetY } = bodyDragRef.current
      bodiesRef.current = bodiesRef.current.map(b =>
        b.id === id ? { ...b, x: w.x - offsetX, y: w.y - offsetY, trail: [] } : b
      )
      return
    }

    if (state === GESTURE.SPAWNING && dragRef.current) {
      dragRef.current = { ...dragRef.current, lastScreenX: x, lastScreenY: y }
      return
    }

    // IDLE: hover feedback. Mouse only — touch has no hover.
    if (e.pointerType === 'touch') return
    const hit = findBodyAt(bodiesRef.current, w.x, w.y, viewportRef.current)
    hoveredIdRef.current = hit?.id ?? null
    setHoveredBody(hit)
    if (hit) {
      setTooltipPos({ x: e.clientX, y: e.clientY })
      setCursor('grab')
    } else {
      setCursor('crosshair')
    }
  }, [clearLongPress, startPan, startSpawn])

  /** Open the property editor for a body, positioned at its current screen point. */
  const openEditorFor = useCallback((id: string) => {
    const body = bodiesRef.current.find(b => b.id === id)
    if (!body) return
    const s = worldToScreen(body.x, body.y, viewportRef.current)
    editingIdRef.current = id
    setEditingBody({
      id, name: body.name, color: body.color, imageUrl: body.imageUrl,
      type: body.type, screenX: s.x, screenY: s.y,
    })
  }, [])

  const commitSpawn = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current
    dragRef.current = null
    predictedRef.current = null
    if (!drag) return

    // Dead zone: never spawn a body under a control.
    //
    // This used to be `height - 160`, a magic number that had to be kept in step
    // with the toolbar by hand. Instead, ask the document what is actually on top
    // at the release point. That tracks any control we add or move, respects
    // pointer-events:none gaps in the control layer (which correctly fall through
    // to the canvas), and will keep working when Phase 4 changes heights again.
    //
    // elementFromPoint is used rather than event.target because pointer capture
    // retargets every event to the canvas, so event.target is always the canvas
    // once a drag is under way.
    const top = document.elementFromPoint(clientX, clientY)
    if (top !== canvasRef.current) return

    let vx = (drag.currentX - drag.startX) * VELOCITY_SCALE
    let vy = (drag.currentY - drag.startY) * VELOCITY_SCALE
    // Deltas are already in world space, so velocity is zoom-independent and must
    // NOT be divided by camera scale. It does need a ceiling, because a full-screen
    // drag while zoomed out spans a huge world distance.
    const speed = Math.hypot(vx, vy)
    if (speed > MAX_SPAWN_SPEED) {
      vx = (vx / speed) * MAX_SPAWN_SPEED
      vy = (vy / speed) * MAX_SPAWN_SPEED
    }

    const type = selectedTypeRef.current
    const mass = defaultMass(type)
    bodiesRef.current = [...bodiesRef.current, {
      id: newId(), type,
      x: drag.startX, y: drag.startY, vx, vy,
      ax: 0, ay: 0, prevAx: 0, prevAy: 0,
      mass, radius: defaultRadius(mass, type),
      trail: [], color: defaultColor(type), pinned: false,
    }]
    setBodyCount(c => c + 1)
  }, [])

  /** Shared by pointerup and pointercancel. */
  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
      const p = pointersRef.current.get(e.pointerId)
      pointersRef.current.delete(e.pointerId)
      const state = gestureRef.current

      if (cancelled) cancelReasonRef.current = 'os-cancel'

      // A pinch never falls back to a one-pointer gesture. Hold LOCKED until every
      // pointer is up, otherwise lifting one finger silently starts a pan.
      if (state === GESTURE.PINCHING || state === GESTURE.LOCKED) {
        pinchRef.current = null
        if (pointersRef.current.size === 0) resetToIdle()
        else gestureRef.current = GESTURE.LOCKED
        return
      }

      if (pointersRef.current.size > 0) {
        // Another pointer is still down but we are not pinching: nothing can be
        // safely resumed, so wait for a clean slate.
        discardActiveGesture('superseded')
        gestureRef.current = GESTURE.LOCKED
        return
      }

      if (cancelled) {
        // OS cancel discards, exactly like a supersede. There is no case where an
        // interrupted gesture should still commit a body.
        discardActiveGesture('os-cancel')
        hoveredIdRef.current = null
        setCursor('crosshair')
        resetToIdle()
        return
      }

      switch (state) {
        case GESTURE.GRABBING: {
          const id = bodyDragRef.current?.id
          const moved = bodyDragMovedRef.current
          releaseGrab()
          hoveredIdRef.current = null
          setCursor('crosshair')
          if (!moved && id) openEditorFor(id)
          break
        }
        case GESTURE.SPAWNING:
          commitSpawn(e.clientX, e.clientY)
          break
        case GESTURE.PENDING: {
          // Below both thresholds, or held without moving: a tap.
          clearLongPress()
          if (p) {
            const w = screenToWorld(p.curX, p.curY, viewportRef.current)
            const hit = findBodyAt(bodiesRef.current, w.x, w.y, viewportRef.current)
            if (hit) {
              openEditorFor(hit.id)
            } else if (interactionModeRef.current === 'spawn') {
              // Tap on empty space places a body at rest, matching "click to place".
              startSpawn(p)
              commitSpawn(e.clientX, e.clientY)
            }
          }
          break
        }
        default:
          break
      }

      resetToIdle()
    },
    [clearLongPress, commitSpawn, discardActiveGesture, openEditorFor, releaseGrab,
     resetToIdle, startSpawn]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => endPointer(e, false),
    [endPointer]
  )

  // Android fires pointercancel more than you would expect — system gestures, palm
  // rejection, an incoming call. All of them discard.
  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => endPointer(e, true),
    [endPointer]
  )

  // Safety net for a pointer that ends without the canvas handler seeing it — the
  // browser can revoke capture, and a lost pointerup would otherwise strand the
  // machine outside IDLE, after which no input is accepted at all. It drives the
  // machine rather than clearing refs behind its back, for the same reason.
  useEffect(() => {
    const onGlobalEnd = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size > 0) return
      discardActiveGesture('os-cancel')
      resetToIdle()
      hoveredIdRef.current = null
      setCursor('crosshair')
    }
    document.addEventListener('pointerup', onGlobalEnd)
    document.addEventListener('pointercancel', onGlobalEnd)
    return () => {
      document.removeEventListener('pointerup', onGlobalEnd)
      document.removeEventListener('pointercancel', onGlobalEnd)
    }
  }, [discardActiveGesture, resetToIdle])

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const { x: wx, y: wy } = eventWorld(e)
    const hit = findBodyAt(bodiesRef.current, wx, wy, viewportRef.current)
    if (hit) {
      bodiesRef.current = bodiesRef.current.filter(b => b.id !== hit.id)
      setBodyCount(c => c - 1)
      if (hoveredIdRef.current === hit.id) {
        hoveredIdRef.current = null
        setHoveredBody(null)
      }
    }
  }, [eventWorld])

  // Read-only snapshot of the machine. Deliberately always present: the gesture
  // state is invisible from the outside, and Phase 6 debugging happens over
  // chrome://inspect on a real device where this is the only way to see it.
  useEffect(() => {
    const w = window as Window & { __gesture?: () => unknown }
    w.__gesture = () => ({
      state: gestureRef.current,
      pointers: [...pointersRef.current.values()].map(p => ({
        id: p.id, x: Math.round(p.curX), y: Math.round(p.curY),
      })),
      cancelReason: cancelReasonRef.current,
      spawning: dragRef.current !== null,
      grabbing: bodyDragRef.current !== null,
      panning: panRef.current !== null,
      grabbedId: bodyDragRef.current?.id ?? null,
      viewport: { ...viewportRef.current },
      // World positions, for asserting a body was or was not displaced.
      bodies: bodiesRef.current.map(b => ({ id: b.id, x: b.x, y: b.y, type: b.type, pinned: !!b.pinned })),
    })
    return () => { delete w.__gesture }
  }, [])

  // Only fires when no pointer is captured, i.e. with nothing held down, so this is
  // purely hover cleanup. An in-progress drag survives leaving the canvas.
  const handlePointerLeave = useCallback(() => {
    if (pointersRef.current.size > 0) return
    hoveredIdRef.current = null
    setHoveredBody(null)
    setCursor('crosshair')
  }, [])

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Desktop only. Browsers synthesise click/dblclick from a double-tap, but on
    // touch the first tap already opens the body editor, so the second lands on
    // whatever is on top by then — the gesture is unreliable rather than merely
    // awkward. Touch uses the Follow toggle inside the editor instead.
    if (lastPointerTypeRef.current === 'touch') return
    const { x: wx, y: wy } = eventWorld(e)
    const hit = findBodyAt(bodiesRef.current, wx, wy, viewportRef.current)
    if (!hit) return
    if (followIdRef.current === hit.id) {
      followIdRef.current = null
      followedTypeRef.current = null
      setFollowedBody(null)
      setFollowedId(null)
    } else {
      followIdRef.current = hit.id
      followedTypeRef.current = hit.type
      setFollowedBody(hit.type)
      setFollowedId(hit.id)
      // A native double-click fires two full click sequences before the dblclick
      // event, and a single click on a body always opens the editor — so without
      // this, double-clicking left both the editor open and follow engaged at
      // once. Double-click's intent is "follow", not "edit"; the editor opening
      // was always an artifact of the first click, not a feature.
      editingIdRef.current = null
      setEditingBody(null)
    }
  }, [eventWorld])

  // ── Body editor callbacks ────────────────────────────────────────────────────

  const handleBodyUpdate = useCallback((updates: Partial<Pick<EditingBodyState, 'name' | 'color' | 'imageUrl'>>) => {
    const id = editingIdRef.current
    if (!id) return
    bodiesRef.current = bodiesRef.current.map(b => b.id === id ? { ...b, ...updates } : b)
    setEditingBody(prev => prev ? { ...prev, ...updates } : null)
  }, [])

  const handleEditorClose = useCallback(() => {
    editingIdRef.current = null
    setEditingBody(null)
  }, [])

  const clearFollow = useCallback(() => {
    followIdRef.current = null
    followedTypeRef.current = null
    setFollowedBody(null)
    setFollowedId(null)
  }, [])

  /** Follow toggle for the body currently open in the editor. */
  const handleToggleFollow = useCallback(() => {
    const id = editingIdRef.current
    if (!id) return
    if (followIdRef.current === id) {
      clearFollow()
      return
    }
    const body = bodiesRef.current.find(b => b.id === id)
    if (!body) return
    followIdRef.current = body.id
    followedTypeRef.current = body.type
    setFollowedBody(body.type)
    setFollowedId(body.id)
  }, [clearFollow])

  const handleBodyDelete = useCallback(() => {
    const id = editingIdRef.current
    if (!id) return
    bodiesRef.current = bodiesRef.current.filter(b => b.id !== id)
    setBodyCount(c => c - 1)
    editingIdRef.current = null
    setEditingBody(null)
  }, [])

  // ── Toolbar actions ──────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    isRunningRef.current = false
    setIsRunning(false)
  }, [])

  const resume = useCallback(() => {
    isRunningRef.current = true
    setIsRunning(true)
  }, [])

  const reset = useCallback(() => {
    bodiesRef.current = []
    setBodyCount(0)
    setHoveredBody(null)
    hoveredIdRef.current = null
    historyRef.current = []
    followIdRef.current = null
    followedTypeRef.current = null
    setFollowedBody(null)
    setFollowedId(null)
    editingIdRef.current = null
    setEditingBody(null)
    history.replaceState(null, '', window.location.pathname)
  }, [])

  const setG = useCallback((v: number) => {
    GRef.current = v
    setGState(v)
  }, [])

  const setSpeed = useCallback((v: number) => {
    speedRef.current = v
    setSpeedState(v)
  }, [])

  const loadPreset = useCallback(
    (name: PresetName) => {
      const canvas = canvasRef.current
      if (!canvas) return
      // Presets are in fixed world units, so the camera is framed to them rather
      // than the layout being sized to the camera.
      const bodies = PRESETS[name](GRef.current)
      bodiesRef.current = bodies
      viewportRef.current = frameToFit(
        bodies,
        canvasCssSize(canvas, viewportRef.current),
        viewportRef.current
      )
      setZoom(viewportRef.current.scale)
      setBodyCount(bodies.length)
      setHoveredBody(null)
      hoveredIdRef.current = null
      historyRef.current = []
      followIdRef.current = null
      followedTypeRef.current = null
      setFollowedBody(null)
      setFollowedId(null)
      editingIdRef.current = null
      setEditingBody(null)
    },
    []
  )

  const share = useCallback(() => {
    window.location.hash = encodeBodies(bodiesRef.current)
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }).catch(() => {})
  }, [])

  // ── Zoom controls ──────────────────────────────────────────────────────────

  // Zoom about the centre of the canvas in CSS pixels.
  const zoomFromCentre = useCallback((factor: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width, height } = canvasCssSize(canvas, viewportRef.current)
    applyZoom(factor, width / 2, height / 2)
  }, [applyZoom])

  const zoomIn = useCallback(() => zoomFromCentre(1.5), [zoomFromCentre])
  const zoomOut = useCallback(() => zoomFromCentre(1 / 1.5), [zoomFromCentre])

  // "Reset view" re-frames whatever is currently in the world. Snapping to
  // {0,0,1} would leave the world origin in the top-left corner, which since the
  // preset rework is no longer where anything is.
  const resetView = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    viewportRef.current = frameToFit(
      bodiesRef.current,
      canvasCssSize(canvas, viewportRef.current),
      viewportRef.current
    )
    setZoom(viewportRef.current.scale)
  }, [])

  // ── Android shell: hardware back + lifecycle ────────────────────────────────

  // Back closes one layer at a time, most-recently-opened first, and only falls
  // through to exiting from the root state — exiting discards the simulation.
  const handleBack = useCallback((): boolean => {
    // Sheets sit above everything else, so they close first — ahead of the body
    // editor, which can be open underneath one.
    if (openSheet) {
      setOpenSheet(null)
      return true
    }
    if (showHelp) {
      setShowHelp(false)
      return true
    }
    if (editingIdRef.current) {
      editingIdRef.current = null
      setEditingBody(null)
      return true
    }
    if (followIdRef.current) {
      followIdRef.current = null
      followedTypeRef.current = null
      setFollowedBody(null)
      setFollowedId(null)
      return true
    }
    return false
  }, [showHelp, openSheet])

  // Escape unwinds exactly one layer, same order as the hardware back button.
  // Previously the sheet had its own Escape listener while this component had
  // another, so a single press dismissed a sheet AND the editor underneath it.
  // Escape never falls through to exiting; that is back-button-only behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.repeat) handleBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleBack])

  useNativeShell({
    onBack: handleBack,
    onPause: () => loopControlRef.current?.stop(),
    onResume: () => loopControlRef.current?.start(),
  })

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      <canvas
        ref={canvasRef}
        // w-full h-full gives the canvas an explicit CSS size. Without it the
        // layout box falls back to the width/height ATTRIBUTES, which sizeCanvas
        // sets from the layout box — a circular dependency that pins the canvas at
        // its 300x150 default and makes elementFromPoint miss it entirely.
        className="absolute inset-0 w-full h-full"
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />

      {/* Top-right: share badge + help button (stacked, no overlap) */}
      <div data-control-layer="top" className="absolute flex flex-col items-end gap-2 z-10 pointer-events-none" style={{ top: 'calc(1rem + env(safe-area-inset-top))', right: 'calc(1rem + env(safe-area-inset-right))' }}>
        {shareCopied && (
          <div className="bg-green-600/90 text-white text-xs px-4 py-2 rounded-full backdrop-blur-sm border border-green-400/30 whitespace-nowrap">
            URL copied to clipboard!
          </div>
        )}
        <button
          onClick={() => setShowHelp(true)}
          className="pointer-events-auto flex items-center justify-center gap-1.5 min-h-[48px] px-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-white/52 hover:text-white/85 hover:bg-white/10 transition-colors text-xs font-medium select-none"
        >
          ? Help
        </button>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {openSheet === 'presets' && (
        <Sheet title="Presets" onClose={() => setOpenSheet(null)}>
          {PRESET_LIST.map(p => (
            <button
              key={p.name}
              onClick={() => { loadPreset(p.name); setOpenSheet(null) }}
              className="w-full min-h-[56px] text-left px-4 py-3 rounded-xl hover:bg-white/10 transition-colors"
            >
              <div className="text-white/90 text-sm font-semibold">{p.label}</div>
              <div className="text-white/40 text-xs mt-0.5">{p.blurb}</div>
            </button>
          ))}
        </Sheet>
      )}

      {openSheet === 'bodyType' && (
        <Sheet title="Body type" onClose={() => setOpenSheet(null)}>
          {BODY_TYPES.map(t => (
            <button
              key={t.type}
              onClick={() => { setSelectedType(t.type); setOpenSheet(null) }}
              aria-pressed={selectedType === t.type}
              className={`w-full min-h-[56px] text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                selectedType === t.type ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
              <span className="text-sm font-semibold">{t.label}</span>
            </button>
          ))}
        </Sheet>
      )}

      {openSheet === 'settings' && (
        <Sheet title="Settings" onClose={() => setOpenSheet(null)}>
          {/*
            Body type also lives here because the standalone button is hidden below
            400px, where seven 48px targets cannot fit in one row. Shown at every
            width so the sheet's contents do not change shape with the viewport.
          */}
          <div className="p-2 pb-0">
            <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Body type</div>
            <div className="flex gap-1.5 flex-wrap">
              {BODY_TYPES.map(t => (
                <button
                  key={t.type}
                  onClick={() => setSelectedType(t.type)}
                  aria-pressed={selectedType === t.type}
                  className={`min-h-[48px] px-3 rounded-xl flex items-center gap-2 text-xs font-semibold transition-colors ${
                    selectedType === t.type ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <SettingsSheetBody
            G={G} onSetG={setG}
            speed={speed} onSetSpeed={setSpeed}
            onReset={reset} onShare={share}
            bodyCount={bodyCount}
          />
        </Sheet>
      )}

      {editingBody && (
        <BodyEditor
          body={editingBody}
          onClose={handleEditorClose}
          onUpdate={handleBodyUpdate}
          onDelete={handleBodyDelete}
          isFollowing={followedId === editingBody.id}
          onToggleFollow={handleToggleFollow}
        />
      )}

      {/* Title */}
      <div data-control-layer="top" className="absolute pointer-events-none select-none" style={{ top: 'calc(1rem + env(safe-area-inset-top))', left: 'calc(1rem + env(safe-area-inset-left))' }}>
        <p className="text-white/70 text-sm font-semibold tracking-wide">N-Body Gravity Sandbox</p>
        <p className="text-white/30 text-[11px]">Velocity Verlet · Newton&apos;s Law</p>
      </div>

      {/* Zoom controls — centered at top */}
      <div data-control-layer="top" className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5 select-none z-10" style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}>
        <button
          onClick={zoomOut}
          className="w-12 h-12 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors text-lg leading-none"
          title="Zoom out"
        >−</button>
        <button
          onClick={resetView}
          className="min-w-[64px] min-h-[48px] text-center text-white/50 hover:text-white/80 text-[11px] font-mono transition-colors px-1"
          title="Reset view"
        >
          {zoom >= 10 ? zoom.toFixed(1) : zoom >= 1 ? zoom.toFixed(2) : zoom.toFixed(3)}×
        </button>
        <button
          onClick={zoomIn}
          className="w-12 h-12 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors text-lg leading-none"
          title="Zoom in"
        >+</button>
      </div>

      {/* Status indicators: rewinding / follow camera */}
      {(isRewinding || followedBody) && (
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10 pointer-events-none" style={{ top: 'calc(4rem + env(safe-area-inset-top))' }}>
          {isRewinding && (
            <div className="bg-purple-700/80 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm border border-purple-400/30 whitespace-nowrap">
              ⏪ Rewinding…
            </div>
          )}
          {followedBody && (
            // Tappable so follow can be released without re-finding the body — which
            // is the hard part on touch, since the followed body is usually moving.
            <button
              onClick={clearFollow}
              aria-label="Stop following"
              className="pointer-events-auto min-h-[48px] bg-blue-700/80 hover:bg-blue-600/90 text-white text-xs px-5 rounded-full backdrop-blur-sm border border-blue-400/40 whitespace-nowrap transition-colors"
            >
              Following {followedBody} · tap to release
            </button>
          )}
        </div>
      )}


      {hoveredBody && (
        <BodyTooltip body={hoveredBody} x={tooltipPos.x} y={tooltipPos.y} />
      )}

      <Toolbar
        selectedType={selectedType}
        onSelectType={setSelectedType}
        isRunning={isRunning}
        onPause={pause}
        onResume={resume}
        onLoadPreset={loadPreset}
        bodyCount={bodyCount}
        mode={interactionMode}
        onSetMode={setInteractionMode}
        openSheet={openSheet}
        onOpenSheet={setOpenSheet}
        isRewinding={isRewinding}
        onRewindStart={startRewind}
        onRewindStop={stopRewind}
      />
    </div>
  )
}
