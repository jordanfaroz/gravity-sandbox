import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'N-Body Gravity Sandbox',
  description: 'Interactive gravitational physics simulation — place stars, planets, and black holes, watch orbits emerge from Newton\'s law.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full overflow-hidden bg-[#0a0a0f]">{children}</body>
    </html>
  )
}
