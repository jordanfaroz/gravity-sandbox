import { Body } from './physics'

export interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export interface Viewport {
  x: number
  y: number
  scale: number
}

export type ParticleKind = 'spark' | 'fire' | 'smoke' | 'shockwave' | 'flash'

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  life: number        // 1 → 0
  decay: number       // life lost per normalised frame
  color: string
  size: number
  startRadius?: number  // shockwave: initial ring radius
  endRadius?: number    // shockwave: final ring radius
}

export interface AbsorptionAnim {
  bhId: string
  bhX: number
  bhY: number
  starColor: string
  startRadius: number
  angle: number        // current orbital angle
  orbitRadius: number  // current distance from BH centre
  life: number         // 1 → 0
  decay: number
  trail: { x: number; y: number }[]
  flashSpawned: boolean
}

export function draw(
  ctx: CanvasRenderingContext2D,
  bodies: Body[],
  particles: Particle[],
  absorptions: AbsorptionAnim[],
  dragState: DragState | null,
  hoveredId: string | null,
  viewport: Viewport
): void {
  const { width, height } = ctx.canvas
  ctx.fillStyle = '#0a0a0f'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.setTransform(viewport.scale, 0, 0, viewport.scale, viewport.x, viewport.y)

  for (const b of bodies) drawTrail(ctx, b)
  for (const p of particles) { if (p.kind === 'smoke') drawParticle(ctx, p) }
  // Absorption ghosts drawn before bodies so the BH event horizon naturally covers them
  for (const a of absorptions) drawAbsorptionGhost(ctx, a)
  for (const b of bodies) drawBody(ctx, b, b.id === hoveredId)
  for (const p of particles) { if (p.kind !== 'smoke') drawParticle(ctx, p) }
  if (dragState) drawArrow(ctx, dragState)

  ctx.restore()
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  switch (p.kind) {
    case 'spark':     drawSpark(ctx, p);     break
    case 'fire':      drawFire(ctx, p);      break
    case 'smoke':     drawSmoke(ctx, p);     break
    case 'shockwave': drawShockwave(ctx, p); break
    case 'flash':     drawFlash(ctx, p);     break
  }
}

function drawSpark(ctx: CanvasRenderingContext2D, p: Particle): void {
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
  if (speed < 0.01) return
  const trailLen = Math.min(speed * 5, 45)
  ctx.save()
  ctx.globalAlpha = p.life
  ctx.strokeStyle = p.color
  ctx.lineWidth = p.size
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.lineTo(p.x - (p.vx / speed) * trailLen, p.y - (p.vy / speed) * trailLen)
  ctx.stroke()
  ctx.restore()
}

function drawFire(ctx: CanvasRenderingContext2D, p: Particle): void {
  const r = p.size * (0.35 + 0.65 * p.life)
  if (r < 0.5) return
  ctx.save()
  ctx.globalAlpha = Math.pow(p.life, 1.4)
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.25, p.color)
  g.addColorStop(1, p.color + '00')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawSmoke(ctx: CanvasRenderingContext2D, p: Particle): void {
  const r = p.size * (1 + 1.8 * (1 - p.life))
  ctx.save()
  ctx.globalAlpha = p.life * 0.16
  ctx.fillStyle = p.color
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawShockwave(ctx: CanvasRenderingContext2D, p: Particle): void {
  const progress = 1 - p.life
  const r = (p.startRadius ?? 0) + ((p.endRadius ?? 80) - (p.startRadius ?? 0)) * progress
  if (r < 0.1) return
  ctx.save()
  ctx.globalAlpha = p.life * p.life * 0.85
  ctx.strokeStyle = p.color
  ctx.lineWidth = 2.5 * p.life
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawFlash(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save()
  ctx.globalAlpha = p.life * p.life
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
  g.addColorStop(0,   '#ffffff')
  g.addColorStop(0.15, '#fffde0')
  g.addColorStop(0.5,  p.color + 'cc')
  g.addColorStop(1,   'transparent')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawTrail(ctx: CanvasRenderingContext2D, body: Body): void {
  const pts = body.trail
  if (pts.length < 2 || body.type === 'star') return

  ctx.save()
  ctx.lineWidth = body.type === 'asteroid' ? 1 : 1.5
  if (body.type === 'asteroid') ctx.setLineDash([2, 5])

  for (let i = 1; i < pts.length; i++) {
    ctx.globalAlpha = (i / pts.length) * 0.65
    ctx.strokeStyle = body.color
    ctx.beginPath()
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
    ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawBody(ctx: CanvasRenderingContext2D, body: Body, hovered: boolean): void {
  switch (body.type) {
    case 'star': drawStar(ctx, body, hovered); break
    case 'planet': drawPlanet(ctx, body, hovered); break
    case 'blackhole': drawBlackHole(ctx, body, hovered); break
    case 'asteroid': drawAsteroid(ctx, body, hovered); break
  }
}

function drawStar(ctx: CanvasRenderingContext2D, b: Body, hovered: boolean): void {
  ctx.save()
  const glowR = b.radius * 3.5
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, glowR)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.07, '#fffdf0')
  g.addColorStop(0.2, b.color)
  g.addColorStop(0.55, b.color + '66')
  g.addColorStop(1, 'transparent')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2)
  ctx.fill()
  if (hovered) drawHoverRing(ctx, b)
  ctx.restore()
}

function drawPlanet(ctx: CanvasRenderingContext2D, b: Body, hovered: boolean): void {
  ctx.save()
  // Glow halo
  const glow = ctx.createRadialGradient(b.x, b.y, b.radius * 0.3, b.x, b.y, b.radius * 2.2)
  glow.addColorStop(0, b.color + 'cc')
  glow.addColorStop(0.5, b.color + '44')
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius * 2.2, 0, Math.PI * 2)
  ctx.fill()

  // Core with slight specular highlight
  const core = ctx.createRadialGradient(
    b.x - b.radius * 0.3, b.y - b.radius * 0.3, 0,
    b.x, b.y, b.radius
  )
  core.addColorStop(0, '#ffffff55')
  core.addColorStop(0.35, b.color)
  core.addColorStop(1, b.color + 'bb')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
  ctx.fill()

  if (hovered) drawHoverRing(ctx, b)
  ctx.restore()
}

function drawBlackHole(ctx: CanvasRenderingContext2D, b: Body, hovered: boolean): void {
  ctx.save()
  const t = Date.now() / 1000

  // Outer gravitational lensing glow
  const og = ctx.createRadialGradient(b.x, b.y, b.radius, b.x, b.y, b.radius * 5.5)
  og.addColorStop(0, 'rgba(90, 0, 220, 0.45)')
  og.addColorStop(0.35, 'rgba(0, 100, 200, 0.18)')
  og.addColorStop(1, 'transparent')
  ctx.fillStyle = og
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius * 5.5, 0, Math.PI * 2)
  ctx.fill()

  // Animated accretion rings
  const ringConfigs = [
    { rMult: 1.45, width: 2.5, opacity: 0.9 },
    { rMult: 1.85, width: 1.8, opacity: 0.55 },
    { rMult: 2.3,  width: 1.0, opacity: 0.3 },
  ]
  for (const ring of ringConfigs) {
    const hue = 270 + Math.sin(t * 0.7 + ring.rMult) * 35
    ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${ring.opacity})`
    ctx.lineWidth = ring.width
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.radius * ring.rMult, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Event horizon (pure black)
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
  ctx.fill()

  // Photon sphere shimmer
  ctx.strokeStyle = `rgba(160, 0, 255, ${0.7 + 0.3 * Math.sin(t * 2)})`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius * 1.1, 0, Math.PI * 2)
  ctx.stroke()

  if (hovered) drawHoverRing(ctx, b)
  ctx.restore()
}

function drawAsteroid(ctx: CanvasRenderingContext2D, b: Body, hovered: boolean): void {
  ctx.save()
  ctx.fillStyle = b.color
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
  ctx.fill()
  if (hovered) drawHoverRing(ctx, b)
  ctx.restore()
}

function drawHoverRing(ctx: CanvasRenderingContext2D, b: Body): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.radius + 9, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawAbsorptionGhost(ctx: CanvasRenderingContext2D, a: AbsorptionAnim): void {
  if (a.trail.length === 0) return
  const { x: gx, y: gy } = a.trail[a.trail.length - 1]
  const progress = 1 - a.life
  const r = a.startRadius * a.life

  // Comet-tail: draw trail segments fading toward the oldest point
  ctx.save()
  for (let i = 1; i < a.trail.length; i++) {
    const t = i / a.trail.length
    ctx.globalAlpha = t * a.life * 0.6
    ctx.strokeStyle = a.starColor
    ctx.lineWidth = Math.max(0.5, r * t * 0.85)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(a.trail[i - 1].x, a.trail[i - 1].y)
    ctx.lineTo(a.trail[i].x, a.trail[i].y)
    ctx.stroke()
  }
  ctx.restore()

  // Ghost star glow — shrinks and dims as life falls
  if (r > 0.3) {
    const glowR = r * 3.5
    ctx.save()
    ctx.globalAlpha = a.life * a.life
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR)
    g.addColorStop(0,    '#ffffff')
    g.addColorStop(0.1,  '#fffdf0')
    g.addColorStop(0.3,  a.starColor)
    g.addColorStop(0.7,  a.starColor + '55')
    g.addColorStop(1,    'transparent')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(gx, gy, glowR, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Accretion stream: bright tendril from ghost toward BH, appears after halfway point
  if (progress > 0.35) {
    const alpha = Math.min(1, (progress - 0.35) / 0.4) * a.life * 0.75
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.lineWidth = Math.max(0.5, r * 0.7)
    ctx.lineCap = 'round'
    const sg = ctx.createLinearGradient(gx, gy, a.bhX, a.bhY)
    sg.addColorStop(0,   a.starColor)
    sg.addColorStop(0.5, a.starColor + '88')
    sg.addColorStop(1,   '#ffffff33')
    ctx.strokeStyle = sg
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(a.bhX, a.bhY)
    ctx.stroke()
    ctx.restore()
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, drag: DragState): void {
  const dx = drag.currentX - drag.startX
  const dy = drag.currentY - drag.startY
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 5) return

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.moveTo(drag.startX, drag.startY)
  ctx.lineTo(drag.currentX, drag.currentY)
  ctx.stroke()

  const angle = Math.atan2(dy, dx)
  const hl = 13
  ctx.beginPath()
  ctx.moveTo(drag.currentX, drag.currentY)
  ctx.lineTo(
    drag.currentX - hl * Math.cos(angle - 0.42),
    drag.currentY - hl * Math.sin(angle - 0.42)
  )
  ctx.lineTo(
    drag.currentX - hl * Math.cos(angle + 0.42),
    drag.currentY - hl * Math.sin(angle + 0.42)
  )
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
