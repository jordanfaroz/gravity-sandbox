export type PointerKind = 'touch' | 'mouse'

export interface StepContent {
  title: string
  body: (kind: PointerKind) => string
  /** data-tutorial value to spotlight, or null for the welcome/done cards. */
  target: string | null
  /** A Next button is always allowed on step 5 in addition to the real event. */
  allowManualNext?: boolean
}

const place = (kind: PointerKind) => (kind === 'touch' ? 'tap' : 'click')

export const STEP_CONTENT: Record<number, StepContent> = {
  1: {
    title: 'Summon a star',
    body: kind => `Select Star, then ${place(kind)} anywhere to place it.`,
    target: 'star-tool',
  },
  2: {
    title: 'Put a planet in orbit',
    body: kind =>
      kind === 'touch'
        ? 'Press and drag to throw. The dotted line is the trajectory preview: it shows where the planet will go. Throw it sideways past the star for an orbit.'
        : 'Click and drag to throw. The dotted line is the trajectory preview: it shows where the planet will go. Throw it sideways past the star for an orbit.',
    target: 'planet-tool',
  },
  3: {
    title: 'Control time',
    body: () => 'Pause to freeze the sim, or hold Rewind to undo a disaster. Speed lives in Settings (⋯).',
    target: 'rewind',
  },
  4: {
    title: 'Move around',
    body: kind => (kind === 'touch' ? 'Drag to pan, pinch to zoom.' : 'Drag to pan, scroll to zoom.'),
    target: 'canvas',
  },
  5: {
    title: 'Now for something fun',
    body: () => 'Drop a black hole nearby and watch what happens.',
    target: 'blackhole-tool',
    allowManualNext: true,
  },
  6: {
    title: 'Short on ideas?',
    body: () => 'Load a preset system from here.',
    target: 'presets',
  },
}

export const ORBIT_HINT_TEXT: Record<'merged' | 'escaped' | 'tap', string> = {
  merged: "It fell in. Throw it a bit harder, sideways.",
  escaped: 'Too fast, it escaped! Try a shorter drag.',
  tap: "Drag, don't tap: the drag sets its speed.",
}
