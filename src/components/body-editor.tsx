'use client'

import { useLayoutEffect, useRef } from 'react'
import { BodyType } from '@/lib/physics'

export interface EditingBodyState {
  id: string
  name?: string
  color: string
  imageUrl?: string
  type: BodyType
  screenX: number
  screenY: number
}

interface Props {
  body: EditingBodyState
  onClose: () => void
  onUpdate: (updates: Partial<Pick<EditingBodyState, 'name' | 'color' | 'imageUrl'>>) => void
  onDelete: () => void
  isFollowing: boolean
  onToggleFollow: () => void
}

const TYPE_LABEL: Record<BodyType, string> = {
  star: 'Star',
  planet: 'Planet',
  blackhole: 'Black Hole',
  asteroid: 'Asteroid',
}

const PANEL_W = 244
// Only an initial guess for the pre-measurement render; the real height is
// measured in a layout effect. Do not rely on this being accurate.
const PANEL_H = 296

/**
 * Bounds the panel must stay clear of: the viewport, minus whatever the control
 * layers occupy.
 *
 * The control rects are read from `[data-control-layer]` — the same elements the
 * spawn dead zone hit-tests — rather than a second hardcoded height, so safe-area
 * insets and any added control move both together. Measured at open time, in
 * layout-viewport coordinates, matching `body.screenX/Y`.
 */
function usableArea(): { top: number; bottom: number; left: number; right: number } {
  const area = { top: 8, bottom: window.innerHeight - 8, left: 8, right: window.innerWidth - 8 }
  const mid = window.innerHeight / 2
  for (const el of document.querySelectorAll('[data-control-layer]')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    // Classify by which half the layer sits in rather than by touching an edge:
    // safe-area insets push the top layers away from y=0, so an edge test would
    // silently stop treating them as obstacles the moment insets appear.
    if (r.top < mid) area.top = Math.max(area.top, r.bottom + 8)
    else area.bottom = Math.min(area.bottom, r.top - 8)
  }
  return area
}

export default function BodyEditor({ body, onClose, onUpdate, onDelete, isFollowing, onToggleFollow }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Provisional position, corrected below once the panel can be measured.
  const left = body.screenX + 20
  const top = body.screenY - PANEL_H / 2

  /**
   * Clamp using the panel's MEASURED size, not a constant.
   *
   * The panel's height depends on its content — adding the Follow button grew it
   * from 296px to 442px — so any hardcoded height silently goes stale and the
   * clamp starts letting the panel run under the controls. Runs in a layout
   * effect (after DOM mutation, before paint) on every render, so it also tracks
   * resizes and content changes without a dependency list to keep in sync.
   */
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const area = usableArea()

    // Never taller than the space the controls leave. On a short screen with both
    // a notch and a gesture bar the panel does not fit at its natural height, and
    // simply clamping the position would push Follow and Delete underneath the
    // toolbar where they cannot be tapped. Capping and scrolling keeps every
    // control reachable instead.
    el.style.maxHeight = `${Math.max(120, area.bottom - area.top)}px`

    const w = el.offsetWidth
    const h = el.offsetHeight

    let l = body.screenX + 20
    let t = body.screenY - h / 2
    if (l + w > area.right) l = body.screenX - w - 20
    if (l < area.left) l = area.left
    if (t + h > area.bottom) t = area.bottom - h
    if (t < area.top) t = area.top

    el.style.left = `${l}px`
    el.style.top = `${t}px`
  })

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => onUpdate({ imageUrl: e.target?.result as string })
    reader.readAsDataURL(file)
  }

  return (
    <div
      ref={panelRef}
      style={{ position: 'fixed', left, top, width: PANEL_W, zIndex: 60 }}
      data-editor-panel="true"
      className="bg-[#0f0f1e]/96 border border-white/15 rounded-xl shadow-2xl text-white text-xs overflow-y-auto overscroll-contain"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
            style={{ backgroundColor: body.color }}
          />
          <span className="font-semibold text-white/80">{TYPE_LABEL[body.type]}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none w-12 h-12 -mr-2 flex items-center justify-center rounded-lg hover:bg-white/10"
        >
          ×
        </button>
      </div>

      {/* Name */}
      <div className="px-3 py-2.5 border-b border-white/10">
        <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Name</div>
        <input
          type="text"
          value={body.name ?? ''}
          maxLength={24}
          onChange={e => onUpdate({ name: e.target.value || undefined })}
          placeholder={TYPE_LABEL[body.type]}
          className="w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-white/90 placeholder-white/20 outline-none focus:border-white/30 transition-colors"
        />
      </div>

      {/* Color */}
      <div className="px-3 py-2.5 border-b border-white/10">
        <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Color</div>
        <div className="flex items-center gap-2.5">
          <label className="relative cursor-pointer flex-shrink-0 group">
            <div
              className="w-9 h-9 rounded-lg border-2 border-white/20 group-hover:border-white/50 transition-colors"
              style={{ backgroundColor: body.color }}
            />
            <input
              type="color"
              value={body.color}
              onChange={e => onUpdate({ color: e.target.value })}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </label>
          <span className="text-white/35 font-mono text-[10px] select-all">{body.color.toUpperCase()}</span>
        </div>
      </div>

      {/* Image */}
      <div className="px-3 py-2.5 border-b border-white/10">
        <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Image (replaces body look)</div>
        {body.imageUrl ? (
          <div className="flex items-center gap-2.5">
            <img
              src={body.imageUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover border border-white/20 flex-shrink-0"
            />
            <button
              onClick={() => onUpdate({ imageUrl: undefined })}
              className="text-white/40 hover:text-red-400 transition-colors"
            >
              Remove image
            </button>
          </div>
        ) : (
          <label
            className="flex flex-col items-center gap-1 border border-dashed border-white/20 rounded-lg p-3 text-white/30 hover:border-white/40 hover:text-white/50 cursor-pointer transition-colors"
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            <span className="text-lg leading-none">↑</span>
            <span>Drop image or click to upload</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </label>
        )}
      </div>

      {/* Follow camera — replaces double-tap-to-follow, which is unreliable on
          touch (the first tap opens this panel, so the second lands on whatever is
          on top by then). Desktop keeps double-click. */}
      <div className="px-3 pt-2">
        <button
          onClick={onToggleFollow}
          aria-pressed={isFollowing}
          className={`w-full min-h-[48px] rounded-lg text-xs font-semibold transition-colors ${
            isFollowing
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
          }`}
        >
          {isFollowing ? '◎ Following — tap to release' : '◎ Follow this body'}
        </button>
      </div>

      {/* Delete */}
      <div className="px-3 py-2">
        <button
          onClick={onDelete}
          className="w-full min-h-[48px] text-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-xs"
        >
          Delete body
        </button>
      </div>
    </div>
  )
}
