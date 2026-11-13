'use client'

import { useEffect, useState } from 'react'

export interface VisualViewportRect {
  /** null until a real measurement lands — callers fall back to CSS until then. */
  height: number | null
  top: number
}

/**
 * Tracks window.visualViewport's height and offsetTop directly, as a JS
 * fallback for phones where the CSS 100dvh unit alone does not track the
 * real visible area — confirmed on a real device after the pure-CSS dvh fix
 * (see HANDOVER.md). offsetTop matters because mobile Safari can shift the
 * visual viewport away from the top of the layout viewport (e.g. while the
 * address bar is animating), not just shrink its height.
 *
 * Does NOT touch canvas sizing or pointer coordinate math — those stay on
 * getBoundingClientRect per the coordinate-space boundary documented on
 * sizeCanvas in gravity-sandbox.tsx. This is for the outer app-shell
 * container only.
 */
export function useVisualViewportRect(): VisualViewportRect {
  const [rect, setRect] = useState<VisualViewportRect>({ height: null, top: 0 })

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    let raf = 0
    const measure = () => setRect({ height: vv.height, top: vv.offsetTop })
    const onChange = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    measure()
    vv.addEventListener('resize', onChange)
    vv.addEventListener('scroll', onChange)
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', onChange)
      vv.removeEventListener('scroll', onChange)
    }
  }, [])

  return rect
}
