import type { Metadata, Viewport } from 'next'
import './globals.css'
import RegisterServiceWorker from '@/components/register-service-worker'

const title = 'N-Body Gravity Sandbox'
const description = 'Interactive gravitational physics simulation — place stars, planets, and black holes, watch orbits emerge from Newton\'s law.'

export const metadata: Metadata = {
  metadataBase: new URL('https://nbody.jordworld.com'),
  title,
  description,
  openGraph: {
    title,
    description,
    url: 'https://nbody.jordworld.com',
    siteName: title,
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximumScale/userScalable: capping page zoom is an accessibility
  // violation (low-vision users rely on pinch-zoom), and it isn't needed for
  // the camera's own pinch-to-zoom — that's scoped to the canvas alone via
  // `touch-action: none`, not by disabling page zoom globally.
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
      <body className="h-full overflow-hidden bg-[#0a0a0f]">
        <noscript>
          <div style={{ padding: '2rem', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center' }}>
            N-Body Gravity Sandbox needs JavaScript enabled to run.
          </div>
        </noscript>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
