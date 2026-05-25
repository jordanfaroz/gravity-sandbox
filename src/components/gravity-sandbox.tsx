'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Body, BodyType, defaultColor, defaultMass, defaultRadius, step } from '@/lib/physics'
import { draw, DragState, Viewport, Particle, AbsorptionAnim } from '@/lib/renderer'
import { encodeBodies, decodeBodies } from '@/lib/serialize'
import { PRESETS, PresetName } from '@/lib/presets'
import Toolbar from './toolbar'
import BodyTooltip from './body-tooltip'

const VELOCITY_SCALE = 0.05
const MIN_ZOOM = 0.04
const MAX_ZOOM = 25
const MAX_BODIES = 45
const MAX_PARTICLES = 300

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
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 })
  // Body being dragged (moves an existing body, sim pauses)
  const bodyDragRef = useRef<{ id: string; offsetX: number; offsetY: number; wasRunning: boolean } | null>(null)
  // Middle-mouse pan state
  const panRef = useRef<{ startX: number; startY: number; vpX: number; vpY: number } | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const absorptionsRef = useRef<AbsorptionAnim[]>([])
  const shakeRef = useRef({ x: 0, y: 0 })

  // React state for UI only
  const [selectedType, setSelectedType] = useState<BodyType>('planet')
  const [isRunning, setIsRunning] = useState(true)
  const [G, setGState] = useState(6.674)
  const [speed, setSpeedState] = useState(1)
  const [hoveredBody, setHoveredBody] = useState<Body | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [bodyCount, setBodyCount] = useState(0)
  const [shareCopied, setShareCopied] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [cursor, setCursor] = useState<string>('crosshair')

  // Convert screen coords → world coords using current viewport
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const { x, y, scale } = viewportRef.current
    return { wx: (sx - x) / scale, wy: (sy - y) / scale }
  }, [])

  // Zoom around a screen-space pivot point
  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    const vp = viewportRef.current
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.scale * factor))
    const ratio = newScale / vp.scale
    viewportRef.current = {
      scale: newScale,
      x: cx * (1 - ratio) + vp.x * ratio,
      y: cy * (1 - ratio) + vp.y * ratio,
    }
    setZoom(newScale)
  }, [])

  // Main rAF loop: physics + render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const hash = window.location.hash.slice(1)
    if (hash) {
      const decoded = decodeBodies(hash)
      if (decoded.length > 0) {
        bodiesRef.current = decoded
        setBodyCount(decoded.length)
      }
    }

    lastTimeRef.current = performance.now()

    function tick(timestamp: number) {
      const delta = Math.min(timestamp - lastTimeRef.current, 100)
      lastTimeRef.current = timestamp

      const dt = (delta / 16.667) * speedRef.current

      if (isRunningRef.current && delta > 0) {
        const { bodies, collisions } = step(bodiesRef.current, GRef.current, dt)
        bodiesRef.current = bodies

        for (const ev of collisions) {
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
              id: crypto.randomUUID(),
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

      const ctx = canvas!.getContext('2d')
      if (ctx) {
        // Apply screen shake as a per-frame viewport offset (doesn't mutate viewportRef)
        const vp = viewportRef.current
        const shakeViewport = {
          ...vp,
          x: vp.x + shakeRef.current.x,
          y: vp.y + shakeRef.current.y,
        }
        draw(ctx, bodiesRef.current, particlesRef.current, absorptionsRef.current, dragRef.current, hoveredIdRef.current, shakeViewport)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    const urlTimer = setInterval(() => {
      if (bodiesRef.current.length > 0) {
        window.location.hash = encodeBodies(bodiesRef.current)
      }
    }, 2000)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
      } else {
        lastTimeRef.current = performance.now()
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearInterval(urlTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Resize canvas to fill the window
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Non-passive wheel listener so we can prevent page zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      applyZoom(factor, cx, cy)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // Global mouseup safety net — cleans up drag/pan if mouse released outside canvas
  useEffect(() => {
    const onGlobalUp = (e: MouseEvent) => {
      if (e.button === 1) {
        panRef.current = null
      } else if (e.button === 0 && bodyDragRef.current) {
        isRunningRef.current = bodyDragRef.current.wasRunning
        bodyDragRef.current = null
        hoveredIdRef.current = null
        setCursor('crosshair')
      }
    }
    document.addEventListener('mouseup', onGlobalUp)
    return () => document.removeEventListener('mouseup', onGlobalUp)
  }, [])

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle button: start pan
    if (e.button === 1) {
      e.preventDefault()
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        vpX: viewportRef.current.x,
        vpY: viewportRef.current.y,
      }
      return
    }
    if (e.button !== 0) return

    const rect = canvasRef.current!.getBoundingClientRect()
    const { wx, wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    // Prefer grabbing an existing body over placing a new one
    const hit = bodiesRef.current.find(b => {
      const dx = b.x - wx
      const dy = b.y - wy
      const gr = b.type === 'star' ? b.radius * 2.5 : b.type === 'blackhole' ? b.radius * 2.0 : b.radius + 10
      return dx * dx + dy * dy < gr * gr
    })

    if (hit) {
      bodyDragRef.current = {
        id: hit.id,
        offsetX: wx - hit.x,
        offsetY: wy - hit.y,
        wasRunning: isRunningRef.current,
      }
      isRunningRef.current = false
      setCursor('grabbing')
    } else {
      dragRef.current = { startX: wx, startY: wy, currentX: wx, currentY: wy }
    }
  }, [screenToWorld])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Pan (middle mouse held)
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX
      const dy = e.clientY - panRef.current.startY
      viewportRef.current = {
        ...viewportRef.current,
        x: panRef.current.vpX + dx,
        y: panRef.current.vpY + dy,
      }
      return
    }

    const rect = canvasRef.current!.getBoundingClientRect()
    const { wx, wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    // Body drag: move the grabbed body in world space
    if (bodyDragRef.current) {
      const { id, offsetX, offsetY } = bodyDragRef.current
      bodiesRef.current = bodiesRef.current.map(b =>
        b.id === id ? { ...b, x: wx - offsetX, y: wy - offsetY, trail: [] } : b
      )
      return
    }

    if (dragRef.current) {
      dragRef.current = { ...dragRef.current, currentX: wx, currentY: wy }
    }

    // Hover detection against world-space body positions
    const hit = bodiesRef.current.find(b => {
      const dx = b.x - wx
      const dy = b.y - wy
      const gr = b.type === 'star' ? b.radius * 2.5 : b.type === 'blackhole' ? b.radius * 2.0 : b.radius + 10
      return dx * dx + dy * dy < gr * gr
    }) ?? null

    hoveredIdRef.current = hit?.id ?? null
    setHoveredBody(hit)
    if (hit) {
      setTooltipPos({ x: e.clientX, y: e.clientY })
      if (!dragRef.current) setCursor('grab')
    } else {
      if (!dragRef.current) setCursor('crosshair')
    }
  }, [screenToWorld])

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1) {
        panRef.current = null
        return
      }
      if (e.button !== 0) return

      // Release a body drag: resume simulation
      if (bodyDragRef.current) {
        const { wasRunning } = bodyDragRef.current
        bodyDragRef.current = null
        isRunningRef.current = wasRunning
        hoveredIdRef.current = null
        setCursor('crosshair')
        return
      }

      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return

      // Ignore clicks that land on the toolbar area
      const rect = canvasRef.current!.getBoundingClientRect()
      const sy = e.clientY - rect.top
      if (sy > rect.height - 160) return

      const vx = (drag.currentX - drag.startX) * VELOCITY_SCALE
      const vy = (drag.currentY - drag.startY) * VELOCITY_SCALE
      const mass = defaultMass(selectedType)

      const body: Body = {
        id: crypto.randomUUID(),
        type: selectedType,
        x: drag.startX,
        y: drag.startY,
        vx,
        vy,
        ax: 0, ay: 0, prevAx: 0, prevAy: 0,
        mass,
        radius: defaultRadius(mass, selectedType),
        trail: [],
        color: defaultColor(selectedType),
        pinned: false,
      }

      bodiesRef.current = [...bodiesRef.current, body]
      setBodyCount(c => c + 1)
    },
    [selectedType]
  )

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const { wx, wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    const hit = bodiesRef.current.find(b => {
      const dx = b.x - wx
      const dy = b.y - wy
      const gr = b.type === 'star' ? b.radius * 2.5 : b.type === 'blackhole' ? b.radius * 2.0 : b.radius + 10
      return dx * dx + dy * dy < gr * gr
    })

    if (hit) {
      bodiesRef.current = bodiesRef.current.filter(b => b.id !== hit.id)
      setBodyCount(c => c - 1)
      if (hoveredIdRef.current === hit.id) {
        hoveredIdRef.current = null
        setHoveredBody(null)
      }
    }
  }, [screenToWorld])

  const handleMouseLeave = useCallback(() => {
    dragRef.current = null
    panRef.current = null
    hoveredIdRef.current = null
    setHoveredBody(null)
    if (bodyDragRef.current) {
      isRunningRef.current = bodyDragRef.current.wasRunning
      bodyDragRef.current = null
    }
    setCursor('crosshair')
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
      const bodies = PRESETS[name](canvas.width, canvas.height, GRef.current)
      bodiesRef.current = bodies
      setBodyCount(bodies.length)
      setHoveredBody(null)
      hoveredIdRef.current = null
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

  const zoomIn = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    applyZoom(1.5, canvas.width / 2, canvas.height / 2)
  }, [applyZoom])

  const zoomOut = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    applyZoom(1 / 1.5, canvas.width / 2, canvas.height / 2)
  }, [applyZoom])

  const resetView = useCallback(() => {
    viewportRef.current = { x: 0, y: 0, scale: 1 }
    setZoom(1)
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onMouseLeave={handleMouseLeave}
      />

      {/* Share confirmation badge */}
      {shareCopied && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-600/90 text-white text-xs px-4 py-2 rounded-full backdrop-blur-sm border border-green-400/30 pointer-events-none">
          URL copied to clipboard!
        </div>
      )}

      {/* Title */}
      <div className="absolute top-4 left-4 pointer-events-none select-none">
        <p className="text-white/70 text-sm font-semibold tracking-wide">N-Body Gravity Sandbox</p>
        <p className="text-white/30 text-[11px]">Velocity Verlet · Newton&apos;s Law</p>
      </div>

      {/* Zoom controls — centered at top */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5 select-none z-10">
        <button
          onClick={zoomOut}
          className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors text-base leading-none"
          title="Zoom out"
        >−</button>
        <button
          onClick={resetView}
          className="min-w-[54px] text-center text-white/50 hover:text-white/80 text-[11px] font-mono transition-colors px-1"
          title="Reset view"
        >
          {zoom >= 10 ? zoom.toFixed(1) : zoom >= 1 ? zoom.toFixed(2) : zoom.toFixed(3)}×
        </button>
        <button
          onClick={zoomIn}
          className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors text-base leading-none"
          title="Zoom in"
        >+</button>
      </div>

      {hoveredBody && (
        <BodyTooltip body={hoveredBody} x={tooltipPos.x} y={tooltipPos.y} />
      )}

      <Toolbar
        selectedType={selectedType}
        onSelectType={setSelectedType}
        G={G}
        onSetG={setG}
        speed={speed}
        onSetSpeed={setSpeed}
        isRunning={isRunning}
        onPause={pause}
        onResume={resume}
        onReset={reset}
        onShare={share}
        onLoadPreset={loadPreset}
        bodyCount={bodyCount}
      />
    </div>
  )
}
