'use client'

import { useEffect, useState, type ReactNode } from 'react'

function checkSupport(): boolean {
  if (typeof document === 'undefined') return true
  const canvas = document.createElement('canvas')
  const hasCanvas2D = typeof canvas.getContext === 'function' && !!canvas.getContext('2d')
  const hasPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window
  return hasCanvas2D && hasPointerEvents
}

/**
 * Gates the simulation behind a feature check, so a browser missing Canvas or
 * Pointer Events sees a plain explanation instead of a blank or crashed page.
 * Starts at `null` (renders nothing) rather than `true`/`false` because the
 * check needs `document`, which doesn't exist during the server prerender —
 * resolving it in an effect keeps the first client render consistent with
 * the server's, avoiding a hydration mismatch.
 */
export default function BrowserSupportGate({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    const ok = checkSupport()
    queueMicrotask(() => setSupported(ok))
  }, [])

  if (supported === null) return null

  if (!supported) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0a0a0f] text-center px-6">
        <div className="max-w-sm">
          <p className="text-white/80 text-base font-semibold mb-2">This browser can&apos;t run the sandbox</p>
          <p className="text-white/40 text-sm">
            N-Body Gravity Sandbox needs Canvas and Pointer Events support. Try a recent version of Chrome, Firefox, Safari, or Edge.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
