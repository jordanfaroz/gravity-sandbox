'use client'

import { BodyType } from '@/lib/physics'
import { PresetName } from '@/lib/presets'

interface Props {
  selectedType: BodyType
  onSelectType: (t: BodyType) => void
  G: number
  onSetG: (v: number) => void
  speed: number
  onSetSpeed: (v: number) => void
  isRunning: boolean
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onShare: () => void
  onLoadPreset: (name: PresetName) => void
  bodyCount: number
}

const BODY_TYPES: { type: BodyType; label: string; color: string }[] = [
  { type: 'star',      label: 'Star',       color: '#FFD700' },
  { type: 'planet',    label: 'Planet',     color: '#4fa3e0' },
  { type: 'blackhole', label: 'Black Hole', color: '#aa44ff' },
  { type: 'asteroid',  label: 'Asteroid',   color: '#9a9a9a' },
]

const PRESETS: { name: PresetName; label: string }[] = [
  { name: 'binary',    label: 'Binary Stars'   },
  { name: 'solar',     label: 'Solar System'   },
  { name: 'figure8',   label: 'Figure-8'       },
  { name: 'slingshot', label: 'Slingshot'      },
  { name: 'blackhole', label: 'Black Hole Field' },
]

export default function Toolbar({
  selectedType, onSelectType,
  G, onSetG,
  speed, onSetSpeed,
  isRunning, onPause, onResume,
  onReset, onShare,
  onLoadPreset,
  bodyCount,
}: Props) {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 p-3 pb-4 pointer-events-none">
      {/* Preset row */}
      <div className="flex gap-1.5 pointer-events-auto">
        {PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => onLoadPreset(p.name)}
            className="px-3 py-1 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/10 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Main toolbar */}
      <div className="flex items-center gap-3 bg-black/70 border border-white/15 rounded-2xl px-5 py-3 backdrop-blur-md pointer-events-auto w-full max-w-4xl">
        {/* Body type selector */}
        <div className="flex gap-1.5 flex-shrink-0">
          {BODY_TYPES.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => onSelectType(type)}
              title={label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                selectedType === type
                  ? 'border-white/40 bg-white/15 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/8'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-white/15 flex-shrink-0" />

        {/* G constant */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/50 text-xs flex-shrink-0">G</span>
          <input
            type="range"
            min={0.1}
            max={20}
            step={0.1}
            value={G}
            onChange={e => onSetG(parseFloat(e.target.value))}
            className="w-24 accent-yellow-400"
          />
          <span className="text-white/70 text-xs w-8 flex-shrink-0">{G.toFixed(1)}</span>
        </div>

        <div className="w-px h-8 bg-white/15 flex-shrink-0" />

        {/* Speed */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/50 text-xs flex-shrink-0">Speed</span>
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={speed}
            onChange={e => onSetSpeed(parseFloat(e.target.value))}
            className="w-24 accent-blue-400"
          />
          <span className="text-white/70 text-xs w-10 flex-shrink-0">{speed.toFixed(1)}×</span>
        </div>

        <div className="w-px h-8 bg-white/15 flex-shrink-0" />

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={isRunning ? onPause : onResume}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors"
          >
            {isRunning ? '⏸ Pause' : '▶ Resume'}
          </button>
          <button
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-red-500/30 text-white/80 hover:text-white border border-white/15 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onShare}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/15 transition-colors"
          >
            Share
          </button>
        </div>

        <div className="ml-auto flex-shrink-0">
          <span className="text-white/35 text-xs">
            {bodyCount} {bodyCount === 1 ? 'body' : 'bodies'}
          </span>
        </div>
      </div>

      {/* Hint text */}
      <p className="text-white/25 text-[11px] pointer-events-none select-none">
        Click to place · Drag to set velocity · Right-click to delete
      </p>
    </div>
  )
}
