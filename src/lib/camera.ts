import { Body, BodyType } from './physics'

/**
 * Camera transform.
 *
 * `x`/`y` are the screen-space translation and `scale` the zoom, both in **CSS
 * pixels**. `dpr` is the device-pixel ratio and exists so that exactly one layer
 * owns the CSS-px ↔ device-px boundary: canvas sizing and `ctx.setTransform`
 * multiply by it, and nothing else in the app ever does.
 *
 * Every helper in this module takes and returns CSS pixels.
 */
export interface Viewport {
  x: number
  y: number
  scale: number
  /** Device pixels per CSS pixel. Pinned to 1 today; Phase 5 caps it at 2. */
  dpr: number
}

export const MIN_ZOOM = 0.04
export const MAX_ZOOM = 25

/**
 * Minimum grab radius in CSS pixels.
 *
 * A fingertip covers far more than a small body's drawn radius, and at low zoom an
 * asteroid is a couple of pixels across. This floors the grab target so it is never
 * smaller than 24 CSS px on screen at any zoom. It applies to mouse input too, so
 * bodies are easier to grab on desktop than they were before Phase 3b-2.
 */
export const MIN_PICK_CSS_PX = 24

/** Canvas-local CSS coordinates for a pointer/mouse event. */
export function eventToCanvas(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

/** Canvas-local CSS pixel size (the backing store divided by the DPR). */
export function canvasCssSize(
  canvas: HTMLCanvasElement,
  vp: Viewport
): { width: number; height: number } {
  return { width: canvas.width / vp.dpr, height: canvas.height / vp.dpr }
}

/**
 * Canvas-local CSS pixels → world.
 *
 * Takes coordinates that are already rect-adjusted — use `eventToCanvas` at the
 * event boundary. This deliberately excludes the render-only screen-shake offset
 * (see `draw`), so hit-testing stays aligned with unshaken world space.
 */
export function screenToWorld(sx: number, sy: number, vp: Viewport): { x: number; y: number } {
  return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale }
}

/** World → canvas-local CSS pixels. Inverse of `screenToWorld`. */
export function worldToScreen(wx: number, wy: number, vp: Viewport): { x: number; y: number } {
  return { x: wx * vp.scale + vp.x, y: wy * vp.scale + vp.y }
}

/**
 * Grab radius in **world** units.
 *
 * The multipliers are the historical values: a star's glow and a black hole's
 * lensing halo are much larger than the body itself, so both are grabbable well
 * outside their radius.
 */
export function pickRadius(bodyRadius: number, type: BodyType, vp: Viewport): number {
  const world =
    type === 'star' ? bodyRadius * 2.5
    : type === 'blackhole' ? bodyRadius * 2.0
    : bodyRadius + 10
  // Floors the grab target at MIN_PICK_CSS_PX on screen, whatever the zoom.
  return Math.max(world, MIN_PICK_CSS_PX / vp.scale)
}

/**
 * Topmost body whose grab radius contains the given world point, or null.
 *
 * Returns the first match in array order, matching the previous `Array.find`
 * behaviour at all five former call sites.
 */
export function findBodyAt(
  bodies: Body[],
  wx: number,
  wy: number,
  vp: Viewport
): Body | null {
  for (const b of bodies) {
    const dx = b.x - wx
    const dy = b.y - wy
    const r = pickRadius(b.radius, b.type, vp)
    if (dx * dx + dy * dy < r * r) return b
  }
  return null
}

/** Fraction of the viewport left as margin around framed content. */
const FRAME_PADDING = 1.12

/**
 * Viewport that fits every body on screen with a margin.
 *
 * Takes the current viewport so `dpr` is carried forward rather than rebuilt —
 * constructing a viewport from scratch is how `dpr` gets silently dropped.
 *
 * With no bodies it centres the world origin, which is where presets are laid
 * out, rather than leaving the origin in the top-left corner.
 */
export function frameToFit(
  bodies: Body[],
  cssSize: { width: number; height: number },
  vp: Viewport,
  padding: number = FRAME_PADDING
): Viewport {
  const { width, height } = cssSize

  if (bodies.length === 0) {
    return { ...vp, scale: 1, x: width / 2, y: height / 2 }
  }

  // Centre on the centre of mass and fit the RADIAL extent around it, rather than
  // using the axis-aligned box of instantaneous positions. These are orbital
  // systems, and several presets start with every planet colinear on the +x axis:
  // that box is wide but nearly flat, and its centre sits out between the star and
  // the outermost planet, so fitting it both over-zooms and mis-centres — the
  // orbits leave the screen as soon as the sim runs. Bodies orbit the barycentre,
  // so the distance they reach from it is what has to stay visible.
  let totalMass = 0, midX = 0, midY = 0
  for (const b of bodies) {
    totalMass += b.mass
    midX += b.x * b.mass
    midY += b.y * b.mass
  }
  midX /= totalMass
  midY /= totalMass

  let maxR = 0
  for (const b of bodies) {
    const r = Math.hypot(b.x - midX, b.y - midY) + b.radius
    if (r > maxR) maxR = r
  }

  // A single body, or several at one point, gives zero extent — floor it so the
  // scale below cannot go infinite.
  const span = Math.max(maxR * 2, 1)

  const scale = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Math.min(width, height) / (span * padding))
  )

  return {
    ...vp,
    scale,
    x: width / 2 - midX * scale,
    y: height / 2 - midY * scale,
  }
}

/**
 * Zoom by `factor` about a canvas-local CSS point, keeping the world point under
 * that anchor fixed on screen. Pure: returns a new viewport.
 */
export function zoomAt(vp: Viewport, factor: number, cx: number, cy: number): Viewport {
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.scale * factor))
  const ratio = scale / vp.scale
  return {
    ...vp,
    scale,
    x: cx * (1 - ratio) + vp.x * ratio,
    y: cy * (1 - ratio) + vp.y * ratio,
  }
}
