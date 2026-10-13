'use client'

interface Props {
  onResolve: (clear: boolean) => void
}

/** Shown instead of the welcome card when the tutorial starts on a non-empty scene. */
export default function ClutterPrompt({ onResolve }: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Clear the scene?"
        className="bg-[#0f0f1e]/97 border border-white/15 rounded-2xl shadow-2xl text-white p-4 w-[300px]"
      >
        <h2 className="font-semibold text-sm mb-2">Clear the scene to start fresh?</h2>
        <p className="text-white/60 text-xs leading-relaxed mb-3">
          The tutorial works best with an empty sandbox. Your current bodies can stay if you&apos;d rather keep them.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onResolve(true)}
            className="flex-1 min-h-[44px] rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors"
          >
            Clear it
          </button>
          <button
            onClick={() => onResolve(false)}
            className="flex-1 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold transition-colors"
          >
            Keep it
          </button>
        </div>
      </div>
    </div>
  )
}
