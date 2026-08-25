import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'N-Body Gravity Sandbox',
  description: 'Interactive gravitational physics simulation — place stars, planets, and black holes, watch orbits emerge from Newton\'s law.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Required for env(safe-area-inset-*) to resolve to real values. targetSdk 35+
  // forces edge-to-edge on Android, so the system bars draw over the page whether
  // we ask for this or not; without `cover` the insets read as 0 and the controls
  // would sit under the gesture bar and the notch.
  viewportFit: 'cover',
  themeColor: '#0a0a0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full overflow-hidden bg-[#0a0a0f]">{children}</body>
    </html>
  )
}
