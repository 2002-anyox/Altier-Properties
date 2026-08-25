import clsx from 'clsx'

export function Wordmark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1B2635] to-[#0A0F17] ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
          <path d="M12 3.2 19.4 21h-3.9l-1.4-3.9H9.9L8.5 21H4.6L12 3.2Zm0 5.9-1.4 5.6h2.8L12 9.1Z" fill="currentColor" className="text-gold" />
        </svg>
      </span>
      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[rgb(var(--c-text-onrail))]">Altier</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--c-text-onrail-muted))]">Properties</span>
        </span>
      )}
    </span>
  )
}
