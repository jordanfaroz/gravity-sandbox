'use client'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
}

/**
 * Bottom sheet for controls that do not earn a place in the persistent bar.
 *
 * Dismissible three ways: tapping the backdrop, the close control, and the
 * hardware back button (wired in the caller's back-precedence chain, ahead of the
 * body editor, and shared with Escape). The sheet deliberately does NOT listen
 * for Escape itself: a private listener here plus the chain in the host closed two
 * layers on one press.
 *
 * NOT marked data-control-layer: it is transient, and the spawn dead zone and the
 * editor's clamp both treat control layers as permanently occupied space. The
 * backdrop covers the whole screen anyway, so a pointer can never reach the canvas
 * while a sheet is open.
 */
export default function Sheet({ title, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop — tap anywhere outside to dismiss */}
      <button
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div
        data-sheet={title}
        className="relative w-full max-w-2xl mx-auto bg-[#0f0f1e] border-t border-white/15 rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: '80vh',
          paddingBottom: 'env(safe-area-inset-bottom)',
          marginLeft: 'env(safe-area-inset-left)',
          marginRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 flex-shrink-0">
          <span className="text-white/80 text-sm font-semibold">{title}</span>
          <button
            onClick={onClose}
            aria-label="Close sheet"
            className="w-12 h-12 -mr-2 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-lg text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain p-2">{children}</div>
      </div>
    </div>
  )
}
