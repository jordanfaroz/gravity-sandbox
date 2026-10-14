import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Unique id for a body.
 *
 * crypto.randomUUID requires a secure context and a reasonably recent browser,
 * so older browsers and plain-HTTP previews need a fallback. The ids are only
 * ever compared for equality within a session, so the fallback does not need to
 * be a real UUID — it just has to not collide.
 */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Triggers a browser download for an in-memory blob (PNG snapshot, WebM clip). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
