'use client'

import { BodyType } from '@/lib/physics'
import { PresetName } from '@/lib/presets'
import { LiquidButton } from '@/components/ui/liquid-glass-button'

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
  { name: 'binary',    label: 'Binary Stars'     },
  { name: 'solar',     label: 'Solar System'     },
  { name: 'figure8',   label: 'Figure-8'         },
  { name: 'slingshot', label: 'Slingshot'        },
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
    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2.5 p-4 pb-5 pointer-events-none">
      {/* Preset row */}
      <div className="flex gap-2 pointer-events-auto">
        {PRESETS.map(p => (
          <LiquidButton
            key={p.name}
            size="sm"
            onClick={() => onLoadPreset(p.name)}
          >
            {p.label}
          </LiquidButton>
        ))}
      </div>

      {/* Main toolbar */}
      <div className="flex items-center gap-4 bg-black/70 border border-white/15 rounded-2xl px-6 py-3.5 backdrop-blur-md pointer-events-auto w-full max-w-5xl">
        {/* Body type selector */}
        <div className="flex gap-2 flex-shrink-0">
          {BODY_TYPES.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => onSelectType(type)}
              title={label}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all border ${
                selectedType === type
                  ? 'border-white/40 bg-white/15 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/8'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-9 bg-white/15 flex-shrink-0" />

        {/* G constant */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-white/50 text-sm flex-shrink-0">G</span>
          <input
            type="range"
            min={0.1}
            max={20}
            step={0.1}
            value={G}
            onChange={e => onSetG(parseFloat(e.target.value))}
            className="w-28 accent-yellow-400"
          />
          <span className="text-white/70 text-sm w-10 flex-shrink-0">{G.toFixed(1)}</span>
        </div>

        <div className="w-px h-9 bg-white/15 flex-shrink-0" />

        {/* Speed */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-white/50 text-sm flex-shrink-0">Speed</span>
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={speed}
            onChange={e => onSetSpeed(parseFloat(e.target.value))}
            className="w-28 accent-blue-400"
          />
          <span className="text-white/70 text-sm w-10 flex-shrink-0">{speed.toFixed(1)}×</span>
        </div>

        <div className="w-px h-9 bg-white/15 flex-shrink-0" />

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <LiquidButton size="sm" onClick={isRunning ? onPause : onResume}>
            {isRunning ? '⏸ Pause' : '▶ Resume'}
          </LiquidButton>
          <LiquidButton size="sm" onClick={onReset}>
            Reset
          </LiquidButton>
          <LiquidButton size="sm" onClick={onShare}>
            Share
          </LiquidButton>
        </div>

        <div className="ml-auto flex-shrink-0">
          <span className="text-white/35 text-sm">
            {bodyCount} {bodyCount === 1 ? 'body' : 'bodies'}
          </span>
        </div>
      </div>

      {/* Hint text */}
      <p className="text-white/25 text-xs pointer-events-none select-none">
        Click to place · Drag to set velocity · Right-click to delete
      </p>
    </div>
  )
}
