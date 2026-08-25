import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Unique id for a body.
 *
 * minSdkVersion 24 admits devices whose Android System WebView may predate
 * Chromium 92, where crypto.randomUUID does not exist. The ids are only ever
 * compared for equality within a session, so the fallback does not need to be a
 * real UUID — it just has to not collide.
 */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
