/**
 * Gesture state machine for canvas input.
 *
 * One enum, one transition table. Arbitration must NOT be reconstructed from a set
 * of interacting booleans — that is how "phantom spawn after a pinch" bugs appear.
 *
 * ── TRANSITION TABLE ───────────────────────────────────────────────────────────
 *
 * FROM      EVENT                              TO         EFFECT
 * ---------------------------------------------------------------------------
 * IDLE      down (mouse/pen, on body)          GRABBING   pause sim if running
 * IDLE      down (mouse/pen, middle button)    PANNING    clears follow camera
 * IDLE      down (mouse/pen, empty, spawn)     SPAWNING   anchor drag
 * IDLE      down (mouse/pen, empty, pan mode)  PANNING    anchor pan
 * IDLE      down (touch, 1st pointer)          PENDING    arm long-press timer
 *
 * PENDING   move > TAP_MAX_PX, spawn mode      SPAWNING   anchor at the DOWN point
 * PENDING   move > TAP_MAX_PX, pan mode        PANNING    anchor pan
 * PENDING   held LONG_PRESS_MS, moved < 8px,   GRABBING   pause sim if running
 *           and a body is under the pointer
 * PENDING   up before thresholds               IDLE       tap: editor, or spawn at rest
 * PENDING   up after TAP_MAX_MS, no move       IDLE       treated as a tap
 *
 * SPAWNING  move                               SPAWNING   update drag endpoint
 * SPAWNING  up                                 IDLE       COMMIT body
 * SPAWNING  cancel (OS or superseded)          IDLE       DISCARD, no body
 * GRABBING  move                               GRABBING   move body in world space
 * GRABBING  up                                 IDLE       resume sim iff it was running
 * GRABBING  cancel                             IDLE       body STAYS where it is now
 * PANNING   move                               PANNING    translate viewport
 * PANNING   up / cancel                        IDLE       nothing to discard
 *
 * *         2nd pointer down (from PENDING,    PINCHING   in-progress gesture is
 *           PANNING, SPAWNING, GRABBING)                  DISCARDED, never committed
 *
 * PINCHING  move (2 pointers)                  PINCHING   anchored zoom + pan
 * PINCHING  up (pointers remain down)          LOCKED     never fall back to a
 *                                                         1-pointer gesture
 * PINCHING  up (last pointer)                  IDLE
 * LOCKED    up (pointers remain)               LOCKED
 * LOCKED    up (last pointer)                  IDLE
 * LOCKED    down                               PINCHING   only if back to 2 pointers
 *
 * Invariant: when the pointer map empties, the state is IDLE. A stuck non-IDLE
 * state means no further input works at all, so this is asserted in the tests.
 */
export const GESTURE = {
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  PANNING: 'PANNING',
  SPAWNING: 'SPAWNING',
  GRABBING: 'GRABBING',
  PINCHING: 'PINCHING',
  LOCKED: 'LOCKED',
} as const

export type Gesture = (typeof GESTURE)[keyof typeof GESTURE]

/** Why a gesture was cancelled. Both discard; kept apart for debugging. */
export type CancelReason =
  /** OS-level: system gesture, palm rejection, call interrupt. */
  | 'os-cancel'
  /** Ours: a second pointer arrived and took over. */
  | 'superseded'

/** Live pointer. Coordinates are canvas-local CSS pixels. */
export interface PointerState {
  id: number
  startX: number
  startY: number
  curX: number
  curY: number
  startTime: number
}

/** Movement beyond this (CSS px) means a drag, not a tap. */
export const TAP_MAX_PX = 10
/** Held longer than this is no longer a tap. */
export const TAP_MAX_MS = 250
/** Hold this long, under LONG_PRESS_MAX_PX of movement, to grab a body. */
export const LONG_PRESS_MS = 400
export const LONG_PRESS_MAX_PX = 8

/**
 * Upper bound on launch speed, in world units per frame.
 *
 * Drag deltas are measured in world space, so a full-screen drag while zoomed out
 * would otherwise produce an absurd velocity — at minimum zoom the screen is
 * 32000 world units wide. Typical orbital speeds in the presets are 3-10.
 */
export const MAX_SPAWN_SPEED = 30

export const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by)

/** True while a pointer is still within both the distance and time tap thresholds. */
export function isTap(p: PointerState, now: number): boolean {
  return (
    distance(p.startX, p.startY, p.curX, p.curY) <= TAP_MAX_PX &&
    now - p.startTime <= TAP_MAX_MS
  )
}

/**
 * Single-pointer default. Two-finger gestures bypass this entirely, and middle-drag
 * still pans on desktop regardless of the mode.
 */
export type InteractionMode = 'spawn' | 'pan'
