import React, { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { drawerVariants, popVariants, spring, swift } from '../../lib/motion'
import type { InvoiceStatus, MaintenancePriority, MaintenanceStatus, PropertyStatus } from '../../lib/types'

export const cx = clsx

/* ------------------------------ Button ----------------------------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  trailing?: React.ReactNode
  block?: boolean
}

const BUTTON_BASE =
  'relative inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-[background-color,color,box-shadow,transform] duration-200 ease-swift select-none disabled:opacity-45 disabled:pointer-events-none active:scale-[0.985] whitespace-nowrap'

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-navy-900 text-[rgb(var(--c-text-onrail))] hover:bg-navy-800 shadow-card dark:bg-gold dark:text-navy-950 dark:hover:bg-gold-strong',
  secondary: 'bg-surface-card text-ink border border-line hover:border-line-strong hover:bg-surface-raised',
  ghost: 'text-ink-secondary hover:text-ink hover:bg-surface-inset',
  gold: 'bg-gold text-white hover:bg-gold-strong shadow-card dark:text-navy-950',
  danger: 'bg-status-critical text-white hover:brightness-95',
}

const BUTTON_SIZES = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' }

export function Button({ variant = 'secondary', size = 'md', icon, trailing, block, className, children, ...rest }: ButtonProps) {
  return (
    <button className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </button>
  )
}

export function IconButton({
  label, className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-secondary transition-colors duration-200 hover:bg-surface-inset hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ------------------------------- Card ------------------------------ */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({
  title, subtitle, action, className,
}: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-[13px] leading-snug text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ------------------------------ Badges ----------------------------- */
export const PROPERTY_STATUS_META: Record<PropertyStatus, { label: string; dot: string; chip: string }> = {
  available: { label: 'Available', dot: 'bg-status-good', chip: 'bg-[rgb(var(--c-status-good)/0.12)] text-[rgb(var(--c-status-good))]' },
  occupied: { label: 'Occupied', dot: 'bg-status-info', chip: 'bg-[rgb(var(--c-status-info)/0.12)] text-[rgb(var(--c-status-info))]' },
  reserved: { label: 'Reserved', dot: 'bg-gold', chip: 'bg-gold-soft text-gold-ink' },
  maintenance: { label: 'Under maintenance', dot: 'bg-status-serious', chip: 'bg-[rgb(var(--c-status-serious)/0.16)] text-[rgb(var(--c-status-serious))]' },
  inactive: { label: 'Inactive', dot: 'bg-ink-muted', chip: 'bg-surface-inset text-ink-muted' },
}

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; chip: string }> = {
  paid: { label: 'Paid', chip: 'bg-[rgb(var(--c-status-good)/0.12)] text-[rgb(var(--c-status-good))]' },
  pending: { label: 'Pending', chip: 'bg-gold-soft text-gold-ink' },
  overdue: { label: 'Overdue', chip: 'bg-[rgb(var(--c-status-critical)/0.14)] text-[rgb(var(--c-status-critical))]' },
  upcoming: { label: 'Upcoming', chip: 'bg-[rgb(var(--c-status-info)/0.12)] text-[rgb(var(--c-status-info))]' },
  partial: { label: 'Part paid', chip: 'bg-[rgb(var(--c-status-serious)/0.16)] text-[rgb(var(--c-status-serious))]' },
}

export const PRIORITY_META: Record<MaintenancePriority, { label: string; chip: string }> = {
  urgent: { label: 'Urgent', chip: 'bg-[rgb(var(--c-status-critical)/0.14)] text-[rgb(var(--c-status-critical))]' },
  high: { label: 'High', chip: 'bg-[rgb(var(--c-status-serious)/0.16)] text-[rgb(var(--c-status-serious))]' },
  medium: { label: 'Medium', chip: 'bg-gold-soft text-gold-ink' },
  low: { label: 'Low', chip: 'bg-surface-inset text-ink-secondary' },
}

export const MAINTENANCE_STATUS_META: Record<MaintenanceStatus, { label: string; chip: string }> = {
  reported: { label: 'Reported', chip: 'bg-surface-inset text-ink-secondary' },
  scheduled: { label: 'Scheduled', chip: 'bg-[rgb(var(--c-status-info)/0.12)] text-[rgb(var(--c-status-info))]' },
  in_progress: { label: 'In progress', chip: 'bg-gold-soft text-gold-ink' },
  awaiting_parts: { label: 'Awaiting parts', chip: 'bg-[rgb(var(--c-status-serious)/0.16)] text-[rgb(var(--c-status-serious))]' },
  completed: { label: 'Completed', chip: 'bg-[rgb(var(--c-status-good)/0.12)] text-[rgb(var(--c-status-good))]' },
}

export function Chip({ className, children, dot }: { className?: string; children: React.ReactNode; dot?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none tracking-[0.01em]',
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />}
      {children}
    </span>
  )
}

export const StatusChip = ({ status }: { status: PropertyStatus }) => {
  const m = PROPERTY_STATUS_META[status]
  return <Chip className={m.chip} dot={m.dot}>{m.label}</Chip>
}

export const InvoiceChip = ({ status }: { status: InvoiceStatus }) => (
  <Chip className={INVOICE_STATUS_META[status].chip}>{INVOICE_STATUS_META[status].label}</Chip>
)

export const PriorityChip = ({ priority }: { priority: MaintenancePriority }) => (
  <Chip className={PRIORITY_META[priority].chip}>{PRIORITY_META[priority].label}</Chip>
)

export const MaintenanceChip = ({ status }: { status: MaintenanceStatus }) => (
  <Chip className={MAINTENANCE_STATUS_META[status].chip}>{MAINTENANCE_STATUS_META[status].label}</Chip>
)

/* ------------------------------ Inputs ----------------------------- */
export function Field({
  label, hint, children, className, id,
}: { label: string; hint?: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[12.5px] font-medium text-ink-secondary">{label}</label>
      {children}
      {hint && <p className="text-[11.5px] text-ink-muted">{hint}</p>}
    </div>
  )
}

const CONTROL =
  'h-10 w-full rounded-xl border border-line bg-surface-card px-3 text-sm text-ink placeholder:text-ink-muted transition-colors duration-200 hover:border-line-strong focus:border-gold focus:outline-none'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => <input ref={ref} className={cx(CONTROL, className)} {...rest} />,
)
Input.displayName = 'Input'

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'h-auto min-h-[88px] py-2.5 leading-relaxed', className)} {...rest} />
}

export function Select({
  className, children, ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(CONTROL, 'appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
    </div>
  )
}

export function SearchInput({
  value, onChange, placeholder = 'Search…', className, shortcut,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; shortcut?: string }) {
  const id = useId()
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(CONTROL, 'pl-9', shortcut && 'pr-12')}
      />
      {shortcut && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted sm:block">
          {shortcut}
        </kbd>
      )}
    </div>
  )
}

export function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ease-premium',
        checked ? 'border-transparent bg-gold' : 'border-line bg-surface-inset',
      )}
    >
      <motion.span
        layout
        transition={spring}
        className="absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full bg-white shadow-sm"
        style={{ height: 18, width: 18, left: checked ? 24 : 3 }}
      />
    </button>
  )
}

/* -------------------------- SegmentedControl ------------------------ */
export function SegmentedControl<T extends string>({
  value, onChange, options, size = 'md', className, ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: React.ReactNode; count?: number }>
  size?: 'sm' | 'md'
  className?: string
  ariaLabel: string
}) {
  const groupId = useId()
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-inset p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative rounded-lg font-medium transition-colors duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-[12.5px]' : 'px-3.5 py-1.5 text-[13px]',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                transition={spring}
                className="absolute inset-0 rounded-lg bg-surface-card shadow-sm ring-1 ring-[rgb(var(--c-border))]"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {o.label}
              {o.count !== undefined && (
                <span className={cx('tnum text-[11px]', active ? 'text-ink-muted' : 'text-ink-muted/80')}>{o.count}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------- Tabs ------------------------------ */
export function Tabs<T extends string>({
  value, onChange, tabs, ariaLabel,
}: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: string; count?: number }>; ariaLabel: string }) {
  const groupId = useId()
  return (
    <div role="tablist" aria-label={ariaLabel} className="scroll-x -mb-px flex items-end gap-1 border-b border-line">
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cx(
              'relative whitespace-nowrap px-3.5 pb-3 pt-2 text-[13.5px] font-medium transition-colors duration-200',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.count !== undefined && (
                <span className="tnum rounded-full bg-surface-inset px-1.5 py-0.5 text-[10.5px] text-ink-muted">{t.count}</span>
              )}
            </span>
            {active && (
              <motion.span layoutId={`tab-${groupId}`} transition={spring} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------- Modal ------------------------------ */
export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useLockBody(open)
  useEscape(open, onClose)
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={swift}
            onClick={onClose}
            className="absolute inset-0 bg-navy-950/50 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            variants={popVariants} initial="initial" animate="animate" exit="exit"
            className={cx('relative w-full overflow-hidden rounded-t-3xl border border-line bg-surface-card shadow-lift sm:rounded-2xl', widths[size])}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
                {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
              </div>
              <IconButton label="Close" onClick={onClose}><X size={17} /></IconButton>
            </div>
            <div className="max-h-[64vh] overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-inset/60 px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------- Drawer ----------------------------- */
export function Drawer({
  open, onClose, title, subtitle, children, footer, width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  useLockBody(open)
  useEscape(open, onClose)
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={swift}
            onClick={onClose} className="absolute inset-0 bg-navy-950/45 backdrop-blur-[3px]"
          />
          <motion.aside
            role="dialog" aria-modal="true" aria-label={title}
            variants={drawerVariants} initial="initial" animate="animate" exit="exit"
            className={cx('absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface-card shadow-lift', width)}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-semibold text-ink">{title}</h2>
                {subtitle && <div className="mt-1 text-[13px] text-ink-muted">{subtitle}</div>}
              </div>
              <IconButton label="Close panel" onClick={onClose}><X size={17} /></IconButton>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-inset/60 px-5 py-4 sm:px-6">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ----------------------------- Empty state -------------------------- */
export function EmptyState({
  icon, title, body, action,
}: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-inset text-ink-muted">
        <div className="absolute inset-x-3 -bottom-px h-px gold-rule" aria-hidden />
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ------------------------------- Avatar ----------------------------- */
export function Avatar({ name, size = 36, tone = 'navy' }: { name: string; size?: number; tone?: 'navy' | 'gold' | 'soft' }) {
  const label = name
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  const tones = {
    navy: 'bg-navy-900 text-[rgb(var(--c-text-onrail))] dark:bg-navy-800',
    gold: 'bg-gold-soft text-gold-ink',
    soft: 'bg-surface-inset text-ink-secondary',
  }
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', tones[tone])}
      style={{ height: size, width: size, fontSize: Math.max(10, size * 0.34) }}
      aria-hidden
    >
      {label}
    </span>
  )
}

/* ------------------------------- Meter ------------------------------ */
export function Meter({
  value, max = 100, tone = 'gold', label, className,
}: { value: number; max?: number; tone?: 'gold' | 'good' | 'critical' | 'info'; label?: string; className?: string }) {
  const pctVal = Math.max(0, Math.min(100, (value / max) * 100))
  const fills = {
    gold: 'bg-gold',
    good: 'bg-status-good',
    critical: 'bg-status-critical',
    info: 'bg-status-info',
  }
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-inset', className)} role="img" aria-label={label ?? `${Math.round(pctVal)}%`}>
      <motion.div
        className={cx('h-full rounded-full', fills[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${pctVal}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/* ------------------------------ Checkbox ---------------------------- */
export function Checkbox({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-left text-[13.5px] text-ink-secondary transition-colors hover:text-ink"
    >
      <span
        className={cx(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-200',
          checked ? 'border-gold bg-gold text-white' : 'border-line-strong bg-surface-card',
        )}
      >
        <AnimatePresence>
          {checked && (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.14 }}>
              <Check size={12} strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {label}
    </button>
  )
}

/* ------------------------------ Toaster ----------------------------- */
export function Toaster({
  toasts, onDismiss,
}: { toasts: Array<{ id: number; title: string; body?: string; tone?: string }>; onDismiss: (id: number) => void }) {
  const tones: Record<string, string> = {
    default: 'border-line',
    success: 'border-[rgb(var(--c-status-good)/0.4)]',
    warning: 'border-[rgb(var(--c-status-serious)/0.4)]',
    critical: 'border-[rgb(var(--c-status-critical)/0.4)]',
  }
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.97 }}
            transition={spring}
            className={cx('pointer-events-auto rounded-2xl border bg-surface-raised px-4 py-3 shadow-lift', tones[t.tone ?? 'default'] ?? tones.default)}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">{t.body}</p>}
              </div>
              <IconButton label="Dismiss" className="-mr-1.5 -mt-1 h-7 w-7" onClick={() => onDismiss(t.id)}>
                <X size={14} />
              </IconButton>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------- hooks ------------------------------ */
export function useLockBody(active: boolean) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}

export function useEscape(active: boolean, fn: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fn() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, fn])
}

/** Counts a number up on mount — used once per figure, never on every re-render. */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  const raf = useRef<number>()
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setValue(target); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, duration])
  return value
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = () => setMatches(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}
