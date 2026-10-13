/**
 * Versioned so a future tutorial rewrite can bump the key and re-show
 * everyone, regardless of whether they completed or skipped v1.
 */
export const TUTORIAL_STORAGE_KEY = 'nbody.tutorial.v1'

export type StoredTutorialStatus = 'completed' | 'skipped'

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode, quota, disabled) — not fatal */
  }
}

/** Pure: whether the tutorial should show itself automatically on this load. */
export function shouldAutoStart(stored: string | null, urlForced: boolean): boolean {
  if (urlForced) return true
  return stored === null
}
