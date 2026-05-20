'use client'

import { Body } from '@/lib/physics'

interface Props {
  body: Body
  x: number
  y: number
}

const TYPE_LABEL: Record<string, string> = {
  star: 'Star',
  planet: 'Planet',
  blackhole: 'Black Hole',
  asteroid: 'Asteroid',
}

export default function BodyTooltip({ body, x, y }: Props) {
  const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy)

  const style: React.CSSProperties = {
    position: 'fixed',
    left: x + 16,
    top: y - 10,
    pointerEvents: 'none',
    zIndex: 50,
  }

  // Clamp to viewport
  if (x > window.innerWidth - 160) style.left = x - 155
  if (y < 60) style.top = y + 20

  return (
    <div style={style} className="bg-black/80 border border-white/20 rounded-lg px-3 py-2 text-xs text-white backdrop-blur-sm min-w-[130px]">
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: body.color }}
        />
        <span className="font-semibold">{TYPE_LABEL[body.type]}</span>
        {body.pinned && <span className="text-yellow-400 text-[10px]">pinned</span>}
      </div>
      <div className="text-white/60 space-y-0.5">
        <div>Mass: <span className="text-white">{body.mass.toFixed(1)}</span></div>
        <div>Speed: <span className="text-white">{speed.toFixed(2)} px/f</span></div>
        <div>
          Radius: <span className="text-white">{body.radius.toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}
