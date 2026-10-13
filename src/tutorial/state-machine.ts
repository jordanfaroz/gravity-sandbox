/**
 * Pure step state machine. No DOM, no timers, no localStorage — every transition
 * is a plain reducer call, so it's directly unit-testable.
 *
 * Steps: 0 welcome, 1 summon star, 2 planet orbit, 3 control time, 4 move around,
 * 5 black hole, 6 presets, 7 done. "Step X of 7" in the UI covers 1..7.
 */
export const LAST_STEP = 7
export const ORBIT_STEP = 2
export const MAX_ORBIT_ATTEMPTS_BEFORE_SHOW_ME = 2

export type OrbitHint = 'merged' | 'escaped' | 'tap' | null

export interface TutorialState {
  active: boolean
  stepIndex: number
  orbitAttempts: number
  orbitHint: OrbitHint
  showMeOffered: boolean
}

export const initialTutorialState: TutorialState = {
  active: false,
  stepIndex: 0,
  orbitAttempts: 0,
  orbitHint: null,
  showMeOffered: false,
}

export type TutorialAction =
  | { type: 'START' }
  | { type: 'RESTART' }
  | { type: 'SKIP' }
  | { type: 'BACK' }
  | { type: 'ADVANCE' }
  | { type: 'ORBIT_FAIL'; reason: Exclude<OrbitHint, null> }
  | { type: 'SHOW_ME_USED' }

function advanceFrom(state: TutorialState): TutorialState {
  const next = state.stepIndex + 1
  if (next > LAST_STEP) return { ...state, active: false }
  return { ...state, stepIndex: next, orbitHint: null, orbitAttempts: 0, showMeOffered: false }
}

export function reduceTutorial(state: TutorialState, action: TutorialAction): TutorialState {
  switch (action.type) {
    case 'START':
    case 'RESTART':
      return { ...initialTutorialState, active: true }

    case 'SKIP':
      return { ...state, active: false }

    case 'BACK':
      if (!state.active || state.stepIndex === 0) return state
      return { ...state, stepIndex: state.stepIndex - 1, orbitHint: null, orbitAttempts: 0, showMeOffered: false }

    case 'ADVANCE':
      if (!state.active) return state
      return advanceFrom(state)

    case 'ORBIT_FAIL': {
      if (!state.active || state.stepIndex !== ORBIT_STEP) return state
      const attempts = state.orbitAttempts + 1
      return {
        ...state,
        orbitAttempts: attempts,
        orbitHint: action.reason,
        showMeOffered: attempts >= MAX_ORBIT_ATTEMPTS_BEFORE_SHOW_ME,
      }
    }

    // "Show me" places a guaranteed-stable orbit; treated as an immediate pass
    // rather than re-running the watch, since the system already proved it works.
    case 'SHOW_ME_USED':
      if (!state.active || state.stepIndex !== ORBIT_STEP) return state
      return advanceFrom(state)

    default:
      return state
  }
}
