'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BodyType } from '@/lib/physics'
import { TutorialState, LAST_STEP } from './state-machine'
import { STEP_CONTENT, ORBIT_HINT_TEXT, PointerKind } from './content'
import { SheetName } from '@/components/toolbar'

const TOOL_TARGET_TYPE: Record<string, BodyType> = {
  'star-tool': 'star',
  'planet-tool': 'planet',
  'blackhole-tool': 'blackhole',
}

const CARD_CLASS =
  'bg-[#0f0f1e]/97 border border-white/15 rounded-2xl shadow-2xl text-white p-4 w-[300px] outline-none'

interface Props {
  tutorialState: TutorialState
  pointerKind: PointerKind
  reducedMotion: boolean
  selectedType: BodyType
  onOpenSheet: (s: SheetName | null) => void
  onSkip: () => void
  onBack: () => void
  onNext: () => void
  onShowMe: () => void
  getStarScreenPos: () => { x: number; y: number } | null
}

export default function TutorialOverlay({
  tutorialState,
  pointerKind,
  reducedMotion,
  selectedType,
  onOpenSheet,
  onSkip,
  onBack,
  onNext,
  onShowMe,
  getStarScreenPos,
}: Props) {
  const { active, stepIndex, orbitHint, showMeOffered } = tutorialState
  const content = STEP_CONTENT[stepIndex]
  const toolType = content ? TOOL_TARGET_TYPE[content.target ?? ''] : undefined
  // While the needed type isn't selected yet, spotlight the sheet row; once it
  // is, spotlight the canvas instead. Non-tool steps just use their own target.
  const target = toolType ? (selectedType === toolType ? 'canvas' : content!.target) : content?.target ?? null

  const [rect, setRect] = useState<DOMRect | null>(null)
  const [sheetRect, setSheetRect] = useState<DOMRect | null>(null)
  const [handPos, setHandPos] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Drive the body-type sheet open for tool-choice sub-steps. Does not force it
  // closed once the right type is picked — the player's own tap already does that.
  useEffect(() => {
    if (!active || !toolType || selectedType === toolType) return
    onOpenSheet('bodyType')
  }, [active, stepIndex, toolType, selectedType, onOpenSheet])

  // Track the spotlighted element every frame: resize, orientation change, sheet
  // open/close, and scroll can all move it, and none of those alone is a reliable
  // single signal to re-measure on.
  useEffect(() => {
    // The condition lives INSIDE measure, not as an early return guarding whether
    // the loop runs at all — an early return would leave `rect` stuck at its last
    // value forever once active/target goes false (e.g. stepping onto the
    // welcome/done cards, which have no target), since nothing would ever call
    // setRect again to clear it. Always scheduling means every dep change
    // self-corrects within one frame, and setState only ever happens from inside
    // this rAF callback, never synchronously in the effect body.
    let raf = 0
    const measure = () => {
      // 'canvas' is never spotlighted as a rect: its bounding box covers almost
      // the whole viewport, which breaks the "card goes above/below the rect"
      // math below (there is no sensible below) and a cutout outlining the
      // entire screen highlights nothing. It renders like "no target" instead —
      // full dim, card centered/docked — which is exactly right once the whole
      // canvas is the interactive surface.
      const el = active && target && target !== 'canvas' ? document.querySelector(`[data-tutorial="${target}"]`) : null
      setRect(el ? el.getBoundingClientRect() : null)
      // The row's own rect isn't enough to avoid the card: a bottom-anchored
      // sheet auto-sizes to its content, so the row can sit anywhere within it.
      // Measuring the whole sheet panel lets the card dodge the sheet entirely
      // instead of just the one row — both the sheet and a bottom-docked mobile
      // card otherwise fight over the same strip of screen.
      const sheetEl = active ? document.querySelector('[data-sheet]') : null
      setSheetRect(sheetEl ? sheetEl.getBoundingClientRect() : null)
      raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [active, target])

  // Ghost-hand: tracks the star's live screen position during step 2 only. Same
  // always-scheduled pattern — leaving step 2 must clear handPos within a frame,
  // not leave it stuck showing on later steps.
  useEffect(() => {
    let raf = 0
    const measure = () => {
      const show = active && stepIndex === 2 && !reducedMotion
      setHandPos(show ? getStarScreenPos() : null)
      raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [active, stepIndex, reducedMotion, getStarScreenPos])

  useEffect(() => {
    if (active) cardRef.current?.focus()
  }, [active, stepIndex])

  const primaryAction = useCallback(() => {
    if (stepIndex === 0) onNext()
    else if (stepIndex === 5) onNext()
    else if (stepIndex === LAST_STEP) onNext()
  }, [stepIndex, onNext])

  // Escape is NOT handled here — it goes through the host's single handleBack
  // precedence chain (shared with the hardware back button and every sheet),
  // same as the rest of the app. A second listener here would reintroduce the
  // exact duplicate-Escape-listener bug Phase 4c already fixed once.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        primaryAction()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, primaryAction])

  // content is undefined for steps 0 (welcome) and 7 (done) — STEP_CONTENT only
  // covers 1-6 — so this must not gate rendering, only active does. Each content
  // usage below is scoped to the stepIndex 1-6 branch, where it's always defined.
  if (!active) return null

  const mobile = typeof window !== 'undefined' && window.innerWidth < 640

  return (
    <div className="fixed inset-0 z-[70]" style={{ pointerEvents: 'none' }} aria-live="polite">
      {rect && (
        <div
          className={reducedMotion ? '' : 'tutorial-cutout-pulse'}
          style={{
            position: 'fixed',
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 16,
            boxShadow: reducedMotion
              ? '0 0 0 9999px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.7)'
              : undefined,
            pointerEvents: 'none',
            transition: 'left 0.15s ease-out, top 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out',
          }}
        />
      )}
      {!rect && (
        // No target (welcome/done cards, or a mid-transition frame with nothing
        // to point at yet) — still dim the screen so the card reads clearly.
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
      )}

      {handPos && (
        <div
          className="tutorial-ghost-hand"
          style={{
            position: 'fixed',
            left: handPos.x - 14,
            top: handPos.y - 14,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.85)',
            boxShadow: '0 0 12px rgba(255,255,255,0.5)',
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label="Tutorial"
        tabIndex={-1}
        className={CARD_CLASS}
        style={
          sheetRect
            ? // A sheet is open (tool-choice sub-step): dodge the WHOLE sheet, not
              // just the target row. A bottom-anchored sheet auto-sizes to its
              // content, so the row can land anywhere inside it — and on mobile,
              // the sheet and a bottom-docked card would otherwise both claim the
              // same strip of screen and overlap.
              {
                position: 'fixed',
                left: '50%',
                bottom: `calc(${window.innerHeight - sheetRect.top + 16}px + env(safe-area-inset-bottom))`,
                transform: 'translateX(-50%)',
                pointerEvents: 'auto',
              }
            : mobile || target === 'canvas'
              ? // Bottom-docked, not just on mobile: when the target IS the canvas
                // (nothing to anchor near), a centered card would sit directly on
                // top of the exact area the step is telling the player to act on.
                {
                  position: 'fixed',
                  left: '50%',
                  bottom: 'calc(96px + env(safe-area-inset-bottom))',
                  transform: 'translateX(-50%)',
                  pointerEvents: 'auto',
                }
              : rect
                ? {
                    position: 'fixed',
                    left: Math.min(Math.max(8, rect.left), window.innerWidth - 316),
                    top: rect.top > window.innerHeight / 2 ? undefined : rect.bottom + 16,
                    bottom: rect.top > window.innerHeight / 2 ? window.innerHeight - rect.top + 16 : undefined,
                    pointerEvents: 'auto',
                  }
                : {
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'auto',
                  }
        }
      >
        {stepIndex === 0 && (
          <>
            <h2 className="font-semibold text-base mb-2">Build your own solar system with real gravity.</h2>
            <div className="flex gap-2 mt-3">
              <button
                onClick={onNext}
                className="flex-1 min-h-[48px] rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Start tutorial
              </button>
              <button
                onClick={onSkip}
                className="min-h-[48px] px-3 rounded-lg text-white/50 hover:text-white/80 text-sm transition-colors"
              >
                Skip — let me play
              </button>
            </div>
          </>
        )}

        {stepIndex >= 1 && stepIndex <= 6 && content && (
          <>
            <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
              Step {stepIndex} of 7
            </div>
            <h2 className="font-semibold text-sm mb-1.5">{content.title}</h2>
            <p className="text-white/75 text-xs leading-relaxed">{content.body(pointerKind)}</p>

            {stepIndex === 2 && orbitHint && (
              <p className="text-amber-300 text-xs mt-2 leading-relaxed">{ORBIT_HINT_TEXT[orbitHint]}</p>
            )}
            {stepIndex === 2 && showMeOffered && (
              <button
                onClick={onShowMe}
                className="w-full mt-2 min-h-[44px] rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold transition-colors"
              >
                Show me
              </button>
            )}

            <div className="flex items-center justify-between mt-3">
              <button
                onClick={onBack}
                disabled={stepIndex === 1}
                className="min-h-[44px] px-3 rounded-lg text-white/50 hover:text-white/80 disabled:opacity-30 disabled:hover:text-white/50 text-xs transition-colors"
              >
                ← Back
              </button>
              <div className="flex items-center gap-2">
                {content.allowManualNext && (
                  <button
                    onClick={onNext}
                    className="min-h-[44px] px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
                  >
                    Next
                  </button>
                )}
                <button
                  onClick={onSkip}
                  className="min-h-[44px] px-3 rounded-lg text-white/40 hover:text-white/70 text-xs transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </>
        )}

        {stepIndex === LAST_STEP && (
          <>
            <h2 className="font-semibold text-base mb-2">You&apos;re ready.</h2>
            <p className="text-white/70 text-xs leading-relaxed mb-3">Everything you build is yours to break.</p>
            <p className="text-white/35 text-[11px] mb-3">Replay the tutorial anytime from the ? menu.</p>
            <button
              onClick={onNext}
              className="w-full min-h-[48px] rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              Start playing
            </button>
          </>
        )}
      </div>
    </div>
  )
}
