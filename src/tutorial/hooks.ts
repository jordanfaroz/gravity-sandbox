'use client'

import { useEffect, useState } from 'react'
import { PointerKind } from './content'

export function usePrefersReducedMotion(): boolean {
  // Lazy initializer, not a synchronous setState in the effect body: matchMedia
  // is available by the time this runs (client-only, guarded for the static-export
  // prerender pass where `window` doesn't exist).
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * Touch vs desktop wording. Starts from a coarse-pointer media query (so the
 * very first render guesses right on a phone), then switches to whatever
 * pointer type was actually last used, matching the main canvas's own
 * lastPointerTypeRef pattern.
 */
export function usePointerKind(): PointerKind {
  const [kind, setKind] = useState<PointerKind>(
    () => (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse')
  )
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => setKind(e.pointerType === 'mouse' ? 'mouse' : 'touch')
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])
  return kind
}
