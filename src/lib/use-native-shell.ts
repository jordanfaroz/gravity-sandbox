'use client'

import { useEffect, useRef } from 'react'

export interface NativeShellHandlers {
  /**
   * Hardware back press. Return true if the press was consumed (e.g. a panel was
   * closed) — returning false exits the app, which discards the simulation, so only
   * do that from the root state.
   */
  onBack: () => boolean
  /** App backgrounded. Stop the rAF loop; do not integrate the elapsed gap on resume. */
  onPause?: () => void
  /** App foregrounded. Reset the frame timer before restarting the loop. */
  onResume?: () => void
}

/**
 * Wires Android hardware back and the Capacitor lifecycle events.
 *
 * Capacitor is imported dynamically and only on a native platform, so the browser
 * build never loads it and static prerendering never touches a native API.
 */
export function useNativeShell(handlers: NativeShellHandlers): void {
  // Held in a ref so the listeners are registered exactly once but always call the
  // latest handlers — re-subscribing on every render would drop back presses.
  // Updated in an effect (not during render) so React stays consistent.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    let disposed = false
    let removeAll: (() => void) | null = null

    void (async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const { App } = await import('@capacitor/app')

      const [back, pause, resume] = await Promise.all([
        App.addListener('backButton', () => {
          if (!handlersRef.current.onBack()) void App.exitApp()
        }),
        App.addListener('pause', () => handlersRef.current.onPause?.()),
        App.addListener('resume', () => handlersRef.current.onResume?.()),
      ])

      removeAll = () => {
        void back.remove()
        void pause.remove()
        void resume.remove()
      }

      // Unmounted while the dynamic imports were in flight
      if (disposed) removeAll()
    })()

    return () => {
      disposed = true
      removeAll?.()
    }
  }, [])
}
