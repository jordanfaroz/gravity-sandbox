'use client'

import { BodyType } from '@/lib/physics'
import { InteractionMode } from '@/lib/gestures'
import { PresetName } from '@/lib/presets'
import {
  BODY_TYPES, PRESET_LIST, TOOL_DATA_TUTORIAL,
  SettingsSheetBody, MyScenesSection, SettingsProps, MyScenesProps,
} from './toolbar'

export interface DesktopPanelProps {
  selectedType: BodyType
  onSelectType: (t: BodyType) => void
  isRunning: boolean
  onPause: () => void
  onResume: () => void
  onLoadPreset: (name: PresetName) => void
  mode: InteractionMode
  onSetMode: (m: InteractionMode) => void
  isRewinding: boolean
  onRewindStart: () => void
  onRewindStop: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
  settings: SettingsProps
  myScenes: MyScenesProps
}

const BTN = 'min-h-[44px] rounded-lg text-sm font-semibold transition-colors select-none flex items-center justify-center'
const BTN_IDLE = 'bg-white/5 border border-white/10 text-white/75 hover:text-white hover:bg-white/10'

/**
 * Comfortable always-visible desktop layout: the same controls the mobile
 * Toolbar + sheets offer, laid out as a persistent right-docked panel instead
 * of a bottom bar + modal sheets (there's no room pressure to justify sheets
 * once the panel has the full viewport height to work with). Collapsible so
 * players can get the canvas back to full width; mobile is untouched.
 */
export default function DesktopPanel({
  selectedType, onSelectType,
  isRunning, onPause, onResume,
  onLoadPreset,
  mode, onSetMode,
  isRewinding, onRewindStart, onRewindStop,
  collapsed, onToggleCollapsed,
  settings, myScenes,
}: DesktopPanelProps) {
  if (collapsed) {
    return (
      <div data-control-layer="right" className="absolute top-0 right-0 h-full flex items-start pointer-events-none" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))', paddingRight: 'env(safe-area-inset-right)' }}>
        <button
          onClick={onToggleCollapsed}
          aria-label="Expand panel"
          title="Expand panel ([)"
          className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-black/70 border border-white/15 rounded-l-xl text-white/60 hover:text-white hover:bg-white/10 backdrop-blur-md transition-colors"
        >
          ‹
        </button>
      </div>
    )
  }

  return (
    <div
      data-control-layer="right"
      className="absolute top-0 right-0 h-full w-[320px] flex flex-col bg-black/70 backdrop-blur-md border-l border-white/10 pointer-events-auto overflow-y-auto"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingRight: 'env(safe-area-inset-right)' }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 flex-shrink-0">
        <span className="text-white/70 text-sm font-semibold">Controls</span>
        <button
          onClick={onToggleCollapsed}
          aria-label="Collapse panel"
          title="Collapse panel ([)"
          className="w-9 h-9 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          ›
        </button>
      </div>

      <div className="p-3 flex flex-col gap-4">
        {/* Play / pause, rewind, mode */}
        <div className="flex items-center gap-2">
          <button
            data-tutorial="pause"
            onClick={isRunning ? onPause : onResume}
            title={isRunning ? 'Pause' : 'Play'}
            aria-label={isRunning ? 'Pause' : 'Play'}
            className={`${BTN} w-11 ${BTN_IDLE}`}
          >
            {isRunning ? '⏸' : '▶'}
          </button>
          <button
            data-tutorial="rewind"
            onPointerDown={e => { onRewindStart(); e.currentTarget.setPointerCapture(e.pointerId) }}
            onPointerUp={onRewindStop}
            onPointerCancel={onRewindStop}
            onPointerLeave={onRewindStop}
            onLostPointerCapture={onRewindStop}
            onContextMenu={e => e.preventDefault()}
            title="Hold to rewind (or hold R)"
            aria-label="Rewind"
            aria-pressed={isRewinding}
            className={`${BTN} w-11 ${isRewinding ? 'bg-purple-500 border border-purple-300 text-white' : BTN_IDLE}`}
          >
            ⏪
          </button>
          <div className="flex items-center rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5 flex-1">
            {(['spawn', 'pan'] as const).map(m => (
              <button
                key={m}
                onClick={() => onSetMode(m)}
                aria-pressed={mode === m}
                className={`flex-1 min-h-[38px] rounded-md text-xs font-semibold transition-colors ${
                  mode === m ? 'bg-white text-black' : 'text-white/55 hover:text-white/85 hover:bg-white/10'
                }`}
              >
                {m === 'spawn' ? '✛ Spawn' : '✋ Pan'}
              </button>
            ))}
          </div>
        </div>

        {/* Body type */}
        <div>
          <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Body type</div>
          <div className="grid grid-cols-2 gap-1.5">
            {BODY_TYPES.map(t => (
              <button
                key={t.type}
                data-tutorial={TOOL_DATA_TUTORIAL[t.type]}
                onClick={() => onSelectType(t.type)}
                aria-pressed={selectedType === t.type}
                className={`${BTN} gap-1.5 justify-start px-2.5 ${
                  selectedType === t.type ? 'bg-white/15 text-white border border-white/20' : BTN_IDLE
                }`}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Presets + my scenes */}
        <div data-tutorial="presets">
          <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Presets</div>
          <div className="flex flex-col gap-0.5 rounded-lg border border-white/10 overflow-hidden">
            {PRESET_LIST.map(p => (
              <button
                key={p.name}
                onClick={() => onLoadPreset(p.name)}
                className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"
              >
                <div className="text-white/90 text-xs font-semibold">{p.label}</div>
                <div className="text-white/40 text-[11px] mt-0.5">{p.blurb}</div>
              </button>
            ))}
          </div>
          <MyScenesSection {...myScenes} />
        </div>

        {/* Gravity, speed, reset, share, snapshot/clip */}
        <div className="border-t border-white/10 pt-1 -mx-3 px-3">
          <SettingsSheetBody {...settings} />
        </div>
      </div>
    </div>
  )
}
