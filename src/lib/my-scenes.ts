import { newId } from './utils'

export interface SavedScene {
  id: string
  name: string
  thumbnail: string
  hash: string
  savedAt: number
}

const STORAGE_KEY = 'nbody.myScenes.v1'
const MAX_SCENES = 20
const MAX_NAME_LENGTH = 40

function isSavedScene(v: unknown): v is SavedScene {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return typeof s.id === 'string' && typeof s.name === 'string' &&
    typeof s.thumbnail === 'string' && typeof s.hash === 'string' && typeof s.savedAt === 'number'
}

// localStorage can throw (private browsing, quota, disabled storage) or hold
// data from an older/foreign shape — every entry point here is defensive so a
// bad or missing localStorage never breaks the rest of the app.
export function loadScenes(): SavedScene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isSavedScene) : []
  } catch {
    return []
  }
}

export function saveScene(name: string, hash: string, thumbnail: string): SavedScene[] {
  try {
    const entry: SavedScene = {
      id: newId(),
      name: name.trim().slice(0, MAX_NAME_LENGTH) || 'Untitled scene',
      thumbnail,
      hash,
      savedAt: Date.now(),
    }
    // Oldest-first, so trimming to the cap drops the oldest scene once it's hit.
    const next = [...loadScenes(), entry].slice(-MAX_SCENES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    return loadScenes()
  }
}

export function deleteScene(id: string): SavedScene[] {
  try {
    const next = loadScenes().filter(s => s.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    return loadScenes()
  }
}
