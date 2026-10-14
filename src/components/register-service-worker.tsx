'use client'

import { useEffect } from 'react'

/** Registers the offline-shell service worker. Renders nothing. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
