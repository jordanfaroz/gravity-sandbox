'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Body } from '@/lib/physics'
import { EventBus, TutorialEvent } from './events'
import { reduceTutorial, initialTutorialState, TutorialState, ORBIT_STEP, LAST_STEP } from './state-machine'
import { readStorage, writeStorage, shouldAutoStart, TUTORIAL_STORAGE_KEY } from './storage'
import { initialOrbitWatch, sampleOrbit, isTapLaunch, OrbitWatchState } from './orbit'

export type SimFrameCallback = (bodies: Body[], dtMs: number, G: number) => void

export interface UseTutorialArgs {
  eventBus: EventBus
  getBodyCount: () => number
  onClearScene: () => void
  /** Registers (or, with null, unregisters) a per-physics-step callback. Only
   * ever registered during the orbit step — zero cost otherwise. */
  registerSimFrame: (cb: SimFrameCallback | null) => void
  /** "Show me": places a guaranteed-stable planet around the given star. */
  placeOrbitingPlanet: (starId: string) => void
}

export interface UseTutorialResult {
  state: TutorialState
  /** The star tracked since step 1, exposed so the host can project it to screen
   * space for the step-2 ghost-hand animation. Null outside that window. */
  starId: string | null
  requestStart: () => void
  skip: () => void
  back: () => void
  next: () => void
  showMe: () => void
  clutterPrompt: boolean
  resolveClutter: (clear: boolean) => void
}

export function useTutorial({
  eventBus,
  getBodyCount,
  onClearScene,
  registerSimFrame,
  placeOrbitingPlanet,
}: UseTutorialArgs): UseTutorialResult {
  const [state, dispatch] = useReducer(reduceTutorial, initialTutorialState)
  const [clutterPrompt, setClutterPrompt] = useState(false)
  const [starId, setStarId] = useState<string | null>(null)
  const planetIdRef = useRef<string | null>(null)
  const orbitWatchRef = useRef<OrbitWatchState>(initialOrbitWatch)
  const pendingStartRef = useRef(false)

  /** Resets every piece of run-scoped bookkeeping a START/RESTART must not inherit. */
  const beginRun = useCallback(() => {
    setStarId(null)
    planetIdRef.current = null
    orbitWatchRef.current = initialOrbitWatch
    dispatch({ type: 'START' })
  }, [])

  const requestStart = useCallback(() => {
    if (getBodyCount() > 0) {
      pendingStartRef.current = true
      setClutterPrompt(true)
    } else {
      beginRun()
    }
  }, [getBodyCount, beginRun])

  const resolveClutter = useCallback(
    (clear: boolean) => {
      if (clear) onClearScene()
      setClutterPrompt(false)
      if (pendingStartRef.current) {
        pendingStartRef.current = false
        beginRun()
      }
    },
    [onClearScene, beginRun]
  )

  const skip = useCallback(() => {
    writeStorage(TUTORIAL_STORAGE_KEY, 'skipped')
    dispatch({ type: 'SKIP' })
  }, [])

  const back = useCallback(() => dispatch({ type: 'BACK' }), [])

  const next = useCallback(() => {
    if (state.stepIndex === LAST_STEP) writeStorage(TUTORIAL_STORAGE_KEY, 'completed')
    dispatch({ type: 'ADVANCE' })
  }, [state.stepIndex])

  const showMe = useCallback(() => {
    if (starId) placeOrbitingPlanet(starId)
    dispatch({ type: 'SHOW_ME_USED' })
  }, [starId, placeOrbitingPlanet])

  // First-visit auto-show + ?tutorial=1 forces it regardless of prior completion.
  //
  // requestStart() reads getBodyCount(), which reads bodiesRef — this must run
  // AFTER GravitySandbox's own mount effect has decoded a shared-link hash into
  // that ref, or a tutorial start on a shared link would wrongly skip the
  // "clear the scene?" prompt. That ordering is guaranteed by React running
  // effects in hook-call order within one component: useTutorial is called
  // after the hash-decoding effect is declared, not by a lazy useReducer
  // initializer (which would run during render, before any effect). The
  // disable below is deliberate, not a missed dependency.
  useEffect(() => {
    const url = new URL(window.location.href)
    const forced = url.searchParams.get('tutorial') === '1'
    const stored = readStorage(TUTORIAL_STORAGE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (shouldAutoStart(stored, forced)) requestStart()
    // Intentionally mount-only: re-running this on every requestStart identity
    // change would re-trigger the auto-show check pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Event bus: advance whichever step is listening for this event.
  useEffect(() => {
    if (!state.active) return
    return eventBus.on((e: TutorialEvent) => {
      switch (e.type) {
        case 'bodySpawned':
          if (state.stepIndex === 1 && e.bodyType === 'star') {
            setStarId(e.id)
            dispatch({ type: 'ADVANCE' })
          } else if (state.stepIndex === ORBIT_STEP && e.bodyType === 'planet') {
            if (isTapLaunch(e.vx, e.vy)) {
              dispatch({ type: 'ORBIT_FAIL', reason: 'tap' })
            } else {
              planetIdRef.current = e.id
              orbitWatchRef.current = initialOrbitWatch
            }
          } else if (state.stepIndex === 5 && e.bodyType === 'blackhole') {
            dispatch({ type: 'ADVANCE' })
          }
          break
        case 'bodyRemoved':
          if (state.stepIndex === ORBIT_STEP && e.id === planetIdRef.current) {
            planetIdRef.current = null
            dispatch({ type: 'ORBIT_FAIL', reason: 'merged' })
          }
          break
        case 'speedChanged':
        case 'rewindUsed':
          if (state.stepIndex === 3) dispatch({ type: 'ADVANCE' })
          break
        case 'cameraMoved':
          if (state.stepIndex === 4) dispatch({ type: 'ADVANCE' })
          break
        case 'presetLoaded':
          if (state.stepIndex === 6) dispatch({ type: 'ADVANCE' })
          break
        default:
          break
      }
    })
  }, [eventBus, state.active, state.stepIndex])

  // Per-physics-step orbit watch. Registered only while step 2 is active AND a
  // non-tap planet has actually been thrown; unregistered otherwise, so there is
  // no per-frame cost for the other 7 steps or outside the tutorial entirely.
  useEffect(() => {
    if (!state.active || state.stepIndex !== ORBIT_STEP) {
      registerSimFrame(null)
      return
    }
    registerSimFrame((bodies, dtMs, G) => {
      const planetId = planetIdRef.current
      if (!planetId) return
      const planet = bodies.find(b => b.id === planetId)
      if (!planet) return // bodyRemoved listener handles the merge case
      const star = (starId && bodies.find(b => b.id === starId)) || bodies.find(b => b.type === 'star')
      if (!star) return

      const sample = {
        dx: planet.x - star.x,
        dy: planet.y - star.y,
        dvx: planet.vx - star.vx,
        dvy: planet.vy - star.vy,
      }
      const result = sampleOrbit(orbitWatchRef.current, sample, G, star.mass, dtMs)
      if (result.status === 'success') {
        planetIdRef.current = null
        dispatch({ type: 'ADVANCE' })
      } else if (result.status === 'escaped') {
        planetIdRef.current = null
        dispatch({ type: 'ORBIT_FAIL', reason: 'escaped' })
      } else {
        orbitWatchRef.current = result.state
      }
    })
    return () => registerSimFrame(null)
  }, [state.active, state.stepIndex, registerSimFrame, starId])

  return { state, starId, requestStart, skip, back, next, showMe, clutterPrompt, resolveClutter }
}
