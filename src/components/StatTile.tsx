import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'
import { Sparkline } from './charts'
import { itemVariants } from '../lib/motion.js'
import { useCountUp } from './ui'

export function StatTile({
  label, value, rawValue, format, delta, deltaLabel, deltaGoodWhenUp = true, trend, trendColor, to, footnote, tone = 'default', icon,
}: {
  label: string
  value: string
  /** When given, the figure counts up on mount. */
  rawValue?: number
  /** Formatter for the animated figure — keeps compact suffixes correct. */
  format?: (n: number) => string
  delta?: number
  deltaLabel?: string
  deltaGoodWhenUp?: boolean
  trend?: number[]
  trendColor?: string
  to?: string
  footnote?: string
  tone?: 'default' | 'critical' | 'good' | 'gold'
  icon?: React.ReactNode
}) {
  const counted = useCountUp(rawValue ?? 0)
  const display =
    rawValue === undefined ? value : format ? format(counted) : formatLike(value, counted)

  const good = delta !== undefined && (delta >= 0) === deltaGoodWhenUp
  const accents = {
    default: 'before:bg-line',
    critical: 'before:bg-status-critical',
    good: 'before:bg-status-good',
    gold: 'before:bg-gold',
  }

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-secondary">{label}</p>
        {icon && <span className="shrink-0 text-ink-muted">{icon}</span>}
      </div>
      <p className="mt-2.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">{display}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {delta !== undefined && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 text-[12px] font-medium',
                good ? 'text-[rgb(var(--c-status-good))]' : 'text-[rgb(var(--c-status-critical))]',
              )}
            >
              {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(delta).toFixed(1)}%
              {deltaLabel && <span className="font-normal text-ink-muted"> {deltaLabel}</span>}
            </span>
          )}
          {footnote && <p className="truncate text-[12px] text-ink-muted">{footnote}</p>}
        </div>
        {trend && trend.length > 1 && <Sparkline values={trend} color={trendColor} width={80} height={26} />}
      </div>
    </>
  )

  const className = clsx(
    'card card-pad relative overflow-hidden transition-[transform,box-shadow] duration-300 ease-premium',
    'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
    accents[tone],
    to && 'hover:-translate-y-0.5 hover:shadow-lift',
  )

  return (
    <motion.div variants={itemVariants}>
      {to ? (
        <Link to={to} className={clsx(className, 'block')}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </motion.div>
  )
}

/** Plain integer fallback when no formatter is supplied. */
function formatLike(_template: string, n: number) {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n)
}
