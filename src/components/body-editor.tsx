'use client'

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
}

const TYPE_LABEL: Record<BodyType, string> = {
  star: 'Star',
  planet: 'Planet',
  blackhole: 'Black Hole',
  asteroid: 'Asteroid',
}

const PANEL_W = 244
const PANEL_H = 296

export default function BodyEditor({ body, onClose, onUpdate, onDelete }: Props) {
  // Position panel to the right of the body, clamped to viewport
  let left = body.screenX + 20
  let top = body.screenY - PANEL_H / 2
  if (typeof window !== 'undefined') {
    if (left + PANEL_W > window.innerWidth - 8) left = body.screenX - PANEL_W - 20
    if (left < 8) left = 8
    if (top < 8) top = 8
    if (top + PANEL_H > window.innerHeight - 8) top = window.innerHeight - PANEL_H - 8
  }

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => onUpdate({ imageUrl: e.target?.result as string })
    reader.readAsDataURL(file)
  }

  return (
    <div
      style={{ position: 'fixed', left, top, width: PANEL_W, zIndex: 60 }}
      className="bg-[#0f0f1e]/96 border border-white/15 rounded-xl shadow-2xl text-white text-xs overflow-hidden"
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
          className="text-white/40 hover:text-white/80 transition-colors text-base leading-none w-5 h-5 flex items-center justify-center"
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

      {/* Delete */}
      <div className="px-3 py-2">
        <button
          onClick={onDelete}
          className="w-full text-center text-red-400/60 hover:text-red-400 transition-colors py-1 text-[11px]"
        >
          Delete body
        </button>
      </div>
    </div>
  )
}
