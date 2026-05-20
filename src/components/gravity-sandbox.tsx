'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Body, BodyType, defaultColor, defaultMass, defaultRadius, step } from '@/lib/physics'
import { draw, DragState } from '@/lib/renderer'
import { encodeBodies, decodeBodies } from '@/lib/serialize'
import { PRESETS, PresetName } from '@/lib/presets'
import Toolbar from './toolbar'
import BodyTooltip from './body-tooltip'

const VELOCITY_SCALE = 0.05 // pixels-dragged → pixels/frame

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

  // React state for UI only
  const [selectedType, setSelectedType] = useState<BodyType>('planet')
  const [isRunning, setIsRunning] = useState(true)
  const [G, setGState] = useState(6.674)
  const [speed, setSpeedState] = useState(1)
  const [hoveredBody, setHoveredBody] = useState<Body | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [bodyCount, setBodyCount] = useState(0)
  const [shareCopied, setShareCopied] = useState(false)

  // Main rAF loop: physics + render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Restore from URL hash on mount
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

      if (isRunningRef.current && delta > 0) {
        // dt normalised to 60 fps baseline
        const dt = (delta / 16.667) * speedRef.current
        bodiesRef.current = step(bodiesRef.current, GRef.current, dt)
      }

      const ctx = canvas!.getContext('2d')
      if (ctx) draw(ctx, bodiesRef.current, dragRef.current, hoveredIdRef.current)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    // Persist state to URL every 2 s (cheap, non-blocking)
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
  }, []) // deliberately empty — all mutable state is in refs

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

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    dragRef.current = { startX: x, startY: y, currentX: x, currentY: y }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (dragRef.current) {
      dragRef.current = { ...dragRef.current, currentX: mx, currentY: my }
    }

    // Hover detection against current bodies snapshot
    const hit = bodiesRef.current.find(b => {
      const dx = b.x - mx
      const dy = b.y - my
      return dx * dx + dy * dy < (b.radius + 10) * (b.radius + 10)
    }) ?? null

    hoveredIdRef.current = hit?.id ?? null
    setHoveredBody(hit)
    if (hit) setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return

      // Ignore if the click landed on the toolbar area
      const rect = canvasRef.current!.getBoundingClientRect()
      const y = e.clientY - rect.top
      if (y > rect.height - 130) return

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
        pinned: selectedType === 'star',
      }

      bodiesRef.current = [...bodiesRef.current, body]
      setBodyCount(c => c + 1)
    },
    [selectedType]
  )

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const hit = bodiesRef.current.find(b => {
      const dx = b.x - mx
      const dy = b.y - my
      return dx * dx + dy * dy < (b.radius + 10) * (b.radius + 10)
    })

    if (hit) {
      bodiesRef.current = bodiesRef.current.filter(b => b.id !== hit.id)
      setBodyCount(c => c - 1)
      if (hoveredIdRef.current === hit.id) {
        hoveredIdRef.current = null
        setHoveredBody(null)
      }
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    dragRef.current = null
    hoveredIdRef.current = null
    setHoveredBody(null)
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

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: 'crosshair' }}
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
