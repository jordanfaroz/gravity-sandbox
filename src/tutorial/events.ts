import { BodyType } from '@/lib/physics'

/**
 * Minimal, typed events the sandbox emits for anything that wants to observe it
 * without reaching into refs. The tutorial is the only current subscriber.
 *
 * bodySpawned/bodyRemoved carry `id` (and bodySpawned carries `vx, vy`) beyond the
 * literal spec list — both are needed to track a specific body's fate (did THIS
 * planet merge, escape, or start from a near-zero drag) rather than just knowing
 * "a body changed somewhere."
 */
export type TutorialEvent =
  | { type: 'bodySpawned'; bodyType: BodyType; id: string; vx: number; vy: number }
  | { type: 'bodyRemoved'; id: string; reason: 'merged' | 'deleted' }
  | { type: 'speedChanged'; value: number }
  | { type: 'pausedChanged'; running: boolean }
  | { type: 'rewindUsed' }
  | { type: 'cameraMoved' }
  | { type: 'presetsOpened' }
  | { type: 'presetLoaded'; name: string }

type Listener = (e: TutorialEvent) => void

export interface EventBus {
  emit(e: TutorialEvent): void
  on(listener: Listener): () => void
}

export function createEventBus(): EventBus {
  const listeners = new Set<Listener>()
  return {
    emit(e) {
      for (const l of listeners) l(e)
    },
    on(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
