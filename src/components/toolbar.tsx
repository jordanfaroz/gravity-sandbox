'use client'

import { BodyType } from '@/lib/physics'
import { InteractionMode } from '@/lib/gestures'
import { PresetName } from '@/lib/presets'

export type SheetName = 'presets' | 'settings' | 'bodyType'

export interface SettingsProps {
  G: number
  onSetG: (v: number) => void
  speed: number
  onSetSpeed: (v: number) => void
  onReset: () => void
  onShare: () => void
  bodyCount: number
}

interface Props {
  selectedType: BodyType
  onSelectType: (t: BodyType) => void
  isRunning: boolean
  onPause: () => void
  onResume: () => void
  onLoadPreset: (name: PresetName) => void
  bodyCount: number
  mode: InteractionMode
  onSetMode: (m: InteractionMode) => void
  isRewinding: boolean
  onRewindStart: () => void
  onRewindStop: () => void
  openSheet: SheetName | null
  onOpenSheet: (s: SheetName | null) => void
}

export const BODY_TYPES: { type: BodyType; label: string; color: string }[] = [
  { type: 'star',      label: 'Star',       color: '#FFD700' },
  { type: 'planet',    label: 'Planet',     color: '#4fa3e0' },
  { type: 'blackhole', label: 'Black Hole', color: '#aa44ff' },
  { type: 'asteroid',  label: 'Asteroid',   color: '#9a9a9a' },
]

export const PRESET_LIST: { name: PresetName; label: string; blurb: string }[] = [
  { name: 'binary',    label: 'Binary Stars',     blurb: 'Two stars locked in mutual orbit' },
  { name: 'solar',     label: 'Solar System',     blurb: 'A pinned sun with five planets' },
  { name: 'figure8',   label: 'Figure-8',         blurb: 'Three equal masses on the figure-eight solution' },
  { name: 'slingshot', label: 'Slingshot',        blurb: 'Asteroids swinging past a heavy planet' },
  { name: 'blackhole', label: 'Black Hole Field', blurb: 'Debris orbiting a 3000-mass black hole' },
  { name: 'galaxy',    label: 'Galaxy Collision', blurb: 'Two cored galaxies on a collision course' },
  { name: 'chaos',     label: '3-Body Chaos',     blurb: 'Equilateral triangle, deliberately perturbed' },
  { name: 'trojan',    label: 'Trojans',          blurb: 'Asteroid swarms at the L4 and L5 points' },
  { name: 'rogue',     label: 'Rogue Star',       blurb: 'An intruder tearing through a planetary system' },
  { name: 'quadruple', label: 'Double Binary',    blurb: 'Two binary pairs orbiting a common centre' },
  { name: 'pulsar',    label: 'Pulsar',           blurb: 'A close companion whipping around a black hole' },
]

/**
 * Take pointer capture, tolerating failure.
 *
 * setPointerCapture throws if there is no active pointer with that id — which can
 * happen if the pointer was released between the event firing and the handler
 * running. Letting that propagate would abort the rest of the handler, so the
 * action is performed first and capture is best-effort.
 */
function capturePointer(e: React.PointerEvent<HTMLElement>): void {
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no active pointer */ }
}

const BTN = 'min-h-[48px] min-w-[48px] rounded-xl text-sm font-semibold transition-colors select-none flex items-center justify-center'
const BTN_IDLE = 'bg-black/70 border border-white/15 text-white/75 hover:text-white hover:bg-white/10 backdrop-blur-md'

export default function Toolbar({
  selectedType,
  isRunning, onPause, onResume,
  bodyCount,
  mode, onSetMode,
  isRewinding, onRewindStart, onRewindStop,
  openSheet, onOpenSheet,
}: Props) {
  const current = BODY_TYPES.find(b => b.type === selectedType)!

  return (
    /*
      The canvas fills the screen edge to edge; it is this control layer that gets
      inset. data-control-layer is the single source of truth for "where the
      controls are" — the body editor clamps against it and the spawn dead zone
      hit-tests these same elements.

      ONE ROW at every form factor. Anything that does not fit lives in a sheet:
      an 11-button preset grid wrapped to two 48px rows and took 67% of a phone
      landscape screen, leaving almost no simulation visible.
    */
    <div
      data-control-layer="bottom"
      className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none"
      style={{
        paddingLeft: 'calc(0.5rem + env(safe-area-inset-left))',
        paddingRight: 'calc(0.5rem + env(safe-area-inset-right))',
        paddingTop: '0.5rem',
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center gap-1 pointer-events-auto">
        {/*
          Hold to rewind. Stops on every release path: pointerup, pointercancel,
          pointerleave and lostpointercapture. Capture is taken on pointerdown so
          sliding a finger off the button cannot strand the rewind state.
        */}
        <button
          data-control="rewind"
          onPointerDown={e => { onRewindStart(); capturePointer(e) }}
          onPointerUp={onRewindStop}
          onPointerCancel={onRewindStop}
          onPointerLeave={onRewindStop}
          onLostPointerCapture={onRewindStop}
          onContextMenu={e => e.preventDefault()}
          title="Hold to rewind (or hold R)"
          aria-label="Rewind"
          aria-pressed={isRewinding}
          className={`${BTN} px-3 ${isRewinding ? 'bg-purple-500 border border-purple-300 text-white' : BTN_IDLE}`}
        >
          ⏪
        </button>

        <button
          data-control="playpause"
          onClick={isRunning ? onPause : onResume}
          title={isRunning ? 'Pause' : 'Play'}
          aria-label={isRunning ? 'Pause' : 'Play'}
          className={`${BTN} px-3 ${BTN_IDLE}`}
        >
          {isRunning ? '⏸' : '▶'}
        </button>

        {/*
          Mode switch. Both segments always visible so the current mode is readable
          at a glance rather than inferred from a single icon that changes shape.
          The label collapses below 400px of row width, where nothing else fits.
        */}
        <div className="flex items-center rounded-xl bg-black/70 border border-white/15 backdrop-blur-md p-0.5 gap-0.5">
          {(['spawn', 'pan'] as const).map(m => (
            <button
              key={m}
              onClick={() => onSetMode(m)}
              aria-pressed={mode === m}
              aria-label={m === 'spawn' ? 'Spawn mode' : 'Pan mode'}
              title={m === 'spawn' ? 'Drag to launch a new body' : 'Drag to move the camera'}
              className={`min-h-[48px] min-w-[48px] px-2.5 rounded-lg text-sm font-semibold transition-colors select-none ${
                mode === m ? 'bg-white text-black' : 'text-white/55 hover:text-white/85 hover:bg-white/10'
              }`}
            >
              {m === 'spawn' ? '✛' : '✋'}
              <span className="hidden min-[560px]:inline ml-1.5">{m === 'spawn' ? 'Spawn' : 'Pan'}</span>
            </button>
          ))}
        </div>

        {/* Which body a spawn creates. A sheet rather than four inline buttons. */}
        <button
          data-control="bodytype"
          onClick={() => onOpenSheet(openSheet === 'bodyType' ? null : 'bodyType')}
          aria-label={`Body type: ${current.label}`}
          title="Choose body type"
          className={`${BTN} px-2.5 gap-1.5 ${BTN_IDLE} hidden min-[400px]:flex`}
        >
          <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: current.color }} />
          <span className="hidden min-[720px]:inline">{current.label}</span>
        </button>

        <button
          data-control="presets"
          onClick={() => onOpenSheet(openSheet === 'presets' ? null : 'presets')}
          aria-label="Presets"
          title="Load a preset scenario"
          className={`${BTN} px-2.5 gap-1.5 ${BTN_IDLE}`}
        >
          ☰<span className="hidden min-[720px]:inline">Presets</span>
        </button>

        <button
          data-control="settings"
          onClick={() => onOpenSheet(openSheet === 'settings' ? null : 'settings')}
          aria-label="Settings"
          title="Gravity, speed, reset, share"
          className={`${BTN} px-3 ${BTN_IDLE}`}
        >
          ⋯
        </button>

        <span className="hidden min-[860px]:inline text-white/35 text-xs px-2 whitespace-nowrap">
          {bodyCount} {bodyCount === 1 ? 'body' : 'bodies'}
        </span>
      </div>
    </div>
  )
}

/** Rows for the settings sheet. Kept here so the sheet content lives with the bar. */
export function SettingsSheetBody({
  G, onSetG, speed, onSetSpeed, onReset, onShare, bodyCount,
}: SettingsProps) {
  return (
    <div className="flex flex-col gap-3 p-2">
      <div>
        <div className="flex justify-between text-white/60 text-xs mb-1">
          <span>Gravity (G)</span><span className="tabular-nums text-white/80">{G.toFixed(1)}</span>
        </div>
        <input
          type="range" min={0.1} max={20} step={0.1} value={G}
          aria-label="Gravity"
          onChange={e => onSetG(parseFloat(e.target.value))}
          className="w-full h-12 accent-yellow-400"
        />
      </div>
      <div>
        <div className="flex justify-between text-white/60 text-xs mb-1">
          <span>Speed</span><span className="tabular-nums text-white/80">{speed.toFixed(1)}×</span>
        </div>
        <input
          type="range" min={0.1} max={5} step={0.1} value={speed}
          aria-label="Speed"
          onChange={e => onSetSpeed(parseFloat(e.target.value))}
          className="w-full h-12 accent-blue-400"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onReset} className={`${BTN} flex-1 px-4 ${BTN_IDLE}`}>Reset</button>
        <button onClick={onShare} className={`${BTN} flex-1 px-4 ${BTN_IDLE}`}>Share</button>
      </div>
      <div className="text-white/35 text-xs text-center">
        {bodyCount} {bodyCount === 1 ? 'body' : 'bodies'} in the simulation
      </div>
    </div>
  )
}
