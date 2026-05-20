import { Body } from './physics'

export interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export function draw(
  ctx: CanvasRenderingContext2D,
  bodies: Body[],
  dragState: DragState | null,
  hoveredId: string | null
): void {
  const { width, height } = ctx.canvas
  ctx.fillStyle = '#0a0a0f'
  ctx.fillRect(0, 0, width, height)

  for (const b of bodies) drawTrail(ctx, b)
  for (const b of bodies) drawBody(ctx, b, b.id === hoveredId)
  if (dragState) drawArrow(ctx, dragState)
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
