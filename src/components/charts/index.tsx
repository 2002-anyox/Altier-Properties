import React, { useId, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Table2 } from 'lucide-react'
import clsx from 'clsx'
import { EASE } from '../../lib/motion'

/* Chart colours are CSS custom properties, so a theme switch repaints the
   marks with no JavaScript and no re-render. Both sets are validated
   against their own surface (see src/index.css). */
export const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)'] as const
export const VIZ_STATUS = {
  good: 'var(--viz-good)',
  warning: 'var(--viz-warning)',
  serious: 'var(--viz-serious)',
  critical: 'var(--viz-critical)',
} as const

const SURFACE = 'var(--viz-surface)'
const GRID = 'var(--viz-grid)'
const AXIS = 'var(--viz-axis)'

/* ------------------------------------------------------------------ *
 * ChartFrame — every chart ships a table view. Identity is never
 * carried by colour alone.
 * ------------------------------------------------------------------ */
export function ChartFrame({
  title, subtitle, legend, action, children, table, className,
}: {
  title: string
  subtitle?: string
  legend?: Array<{ label: string; color: string; muted?: boolean }>
  action?: React.ReactNode
  children: React.ReactNode
  table?: React.ReactNode
  className?: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const labelId = useId()
  return (
    <section className={clsx('card flex min-w-0 flex-col', className)} aria-labelledby={labelId}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h3 id={labelId} className="text-[15px] font-semibold leading-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-[12.5px] leading-snug text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <div className="inline-flex rounded-lg border border-line bg-surface-inset p-0.5">
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-label={v === 'chart' ? 'Chart view' : 'Table view'}
                  aria-pressed={view === v}
                  className={clsx(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    view === v ? 'bg-surface-card text-ink shadow-sm' : 'text-ink-muted hover:text-ink-secondary',
                  )}
                >
                  {v === 'chart' ? <BarChart3 size={14} /> : <Table2 size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {legend && legend.length > 1 && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pt-3 sm:px-6">
          {legend.map((l) => (
            <li key={l.label} className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
              <span className="h-2 w-2 rounded-full" style={{ background: l.color, opacity: l.muted ? 0.5 : 1 }} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center px-2 pb-4 pt-3 sm:px-3">
        {view === 'chart' ? children : <div className="scroll-x px-3 sm:px-3">{table}</div>}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Area / line chart with a crosshair tooltip
 * ------------------------------------------------------------------ */
export interface SeriesDef { key: string; label: string; color: string; dashed?: boolean }

export function AreaTrendChart<T extends Record<string, any>>({
  data, series, xKey, format, height = 220, yTicks = 4,
}: {
  data: T[]
  series: SeriesDef[]
  xKey: keyof T
  format: (n: number) => string
  height?: number
  yTicks?: number
}) {
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const W = 720
  const H = height
  const pad = { top: 14, right: 58, bottom: 26, left: 16 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom

  const max = useMemo(() => {
    const m = Math.max(...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)), 1)
    const mag = Math.pow(10, Math.floor(Math.log10(m)))
    return Math.ceil(m / mag) * mag
  }, [data, series])

  const x = (i: number) => pad.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW)
  const y = (v: number) => pad.top + plotH - (v / max) * plotH

  const linePath = (key: string) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Number(d[key]) || 0).toFixed(1)}`).join(' ')

  const areaPath = (key: string) =>
    `${linePath(key)} L${x(data.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i)

  const onMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const rel = ((clientX - rect.left) / rect.width) * W
    const idx = Math.round(((rel - pad.left) / plotW) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, idx)))
  }

  const last = data[data.length - 1]

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y"
        style={{ height: H }}
        role="img"
        aria-label={`${series.map((s) => s.label).join(' and ')} over time`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${gid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.20" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>

        {/* recessive hairline grid */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={pad.left + plotW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={pad.left + plotW + 8} y={y(t) + 4} fontSize="10.5" fill="var(--viz-axis)" className="tnum">
              {format(t)}
            </text>
          </g>
        ))}

        {series.map((s, i) => (
          <g key={s.key}>
            {!s.dashed && <path d={areaPath(s.key)} fill={`url(#${gid}-g${i})`} />}
            <motion.path
              d={linePath(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? '4 4' : undefined}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: EASE, delay: i * 0.08 }}
            />
            {/* end marker with a surface ring so overlapping series stay legible */}
            <circle cx={x(data.length - 1)} cy={y(Number(last?.[s.key]) || 0)} r="4.5" fill={s.color} stroke={SURFACE} strokeWidth="2" />
          </g>
        ))}

        {/* x labels — every other one on narrow charts */}
        {data.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            fontSize="10.5"
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            fill="var(--viz-axis)"
            opacity={data.length > 8 && i % 2 === 1 ? 0 : 1}
          >
            {String(d[xKey])}
          </text>
        ))}

        <line x1={pad.left} x2={pad.left + plotW} y1={pad.top + plotH} y2={pad.top + plotH} stroke={AXIS} strokeWidth="1" />

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke={AXIS} strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r="5" fill={s.color} stroke={SURFACE} strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-lift"
          style={{
            left: `${((x(hover) - pad.left) / W) * 100}%`,
            transform: hover > data.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <p className="text-[11.5px] font-semibold text-ink">{String(data[hover][xKey])}</p>
          <ul className="mt-1.5 space-y-1">
            {series.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-4 text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="tnum font-medium text-ink">{format(Number(data[hover][s.key]) || 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Donut — part-to-whole at a glance, capped at six segments
 * ------------------------------------------------------------------ */
export function DonutChart({
  segments, centerValue, centerLabel, size = 190, thickness = 22,
}: {
  segments: Array<{ label: string; value: number; color: string }>
  centerValue: string
  centerLabel: string
  size?: number
  thickness?: number
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const [active, setActive] = useState<number | null>(null)
  let offset = 0

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={thickness} />
          {segments.map((s, i) => {
            const frac = s.value / total
            const len = frac * c
            /* a 2px surface gap does the separating — never a stroke around the mark */
            const dash = `${Math.max(0, len - 3)} ${c - Math.max(0, len - 3)}`
            const rotation = (offset / total) * 360 - 90
            offset += s.value
            return (
              <motion.circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={active === i ? thickness + 4 : thickness}
                strokeDasharray={dash}
                strokeLinecap="butt"
                transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: active === null || active === i ? 1 : 0.4 }}
                transition={{ duration: 0.45, ease: EASE, delay: i * 0.06 }}
                style={{ transition: 'stroke-width 200ms cubic-bezier(0.22,1,0.36,1)' }}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-2xl font-semibold leading-none text-ink">{centerValue}</span>
          <span className="mt-1 text-[11px] uppercase tracking-[0.09em] text-ink-muted">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 max-w-[280px] space-y-1.5">
        {segments.map((s, i) => (
          <li
            key={s.label}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className="flex min-w-0 items-center justify-between gap-4 rounded-lg px-2 py-1 transition-colors hover:bg-surface-inset"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-[13px] text-ink-secondary">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
              {s.value}
              <span className="ml-1.5 font-normal text-ink-muted">{Math.round((s.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Horizontal bars — one series, one colour; length is the encoding
 * ------------------------------------------------------------------ */
export function BarList({
  items, format, color = VIZ[0], barHeight = 22,
}: {
  items: Array<{ label: string; value: number; note?: string }>
  format: (n: number) => string
  color?: string
  barHeight?: number
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-3 px-3">
      {items.map((item, i) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] text-ink-secondary">{item.label}</span>
            <span className="tnum shrink-0 text-[12.5px] font-semibold text-ink">
              {format(item.value)}
              {item.note && <span className="ml-1.5 font-normal text-ink-muted">{item.note}</span>}
            </span>
          </div>
          <div className="h-[var(--bh)] w-full overflow-hidden rounded-[4px] bg-surface-inset" style={{ ['--bh' as string]: `${barHeight * 0.36}px` }}>
            <motion.div
              className="h-full rounded-r-[4px]"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${(item.value / max) * 100}%` }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.05 * i }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ *
 * Grouped columns — up to three series, 2px surface gap between bars
 * ------------------------------------------------------------------ */
export function ColumnChart({
  data, series, xKey, format, height = 200,
}: {
  data: Array<Record<string, any>>
  series: SeriesDef[]
  xKey: string
  format: (n: number) => string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = height
  const pad = { top: 12, right: 56, bottom: 28, left: 8 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const max = Math.max(...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)), 1)
  const band = plotW / data.length
  const barW = Math.min(24, (band - 12) / series.length - 2)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={series.map((s) => s.label).join(' and ')}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={pad.left + plotW} y1={pad.top + plotH * (1 - f)} y2={pad.top + plotH * (1 - f)} stroke={GRID} strokeWidth="1" />
            <text x={pad.left + plotW + 8} y={pad.top + plotH * (1 - f) + 4} fontSize="10.5" fill="var(--viz-axis)" className="tnum">
              {format(max * f)}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={pad.left + i * band} y={pad.top} width={band} height={plotH} fill="transparent" />
            {series.map((s, si) => {
              const v = Number(d[s.key]) || 0
              const h = (v / max) * plotH
              const groupW = series.length * barW + (series.length - 1) * 2
              const x = pad.left + i * band + (band - groupW) / 2 + si * (barW + 2)
              return (
                <motion.rect
                  key={s.key}
                  x={x}
                  width={barW}
                  rx="4"
                  fill={s.color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                  initial={{ y: pad.top + plotH, height: 0 }}
                  animate={{ y: pad.top + plotH - h, height: h }}
                  transition={{ duration: 0.55, ease: EASE, delay: i * 0.03 + si * 0.04 }}
                />
              )
            })}
            <text x={pad.left + i * band + band / 2} y={H - 9} fontSize="10.5" textAnchor="middle" fill="var(--viz-axis)">
              {String(d[xKey])}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={pad.left + plotW} y1={pad.top + plotH} y2={pad.top + plotH} stroke={AXIS} strokeWidth="1" />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-lift"
          style={{
            left: `${((pad.left + hover * band + band / 2) / W) * 100}%`,
            transform: hover > data.length / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
          }}
        >
          <p className="text-[11.5px] font-semibold text-ink">{String(data[hover][xKey])}</p>
          <ul className="mt-1.5 space-y-1">
            {series.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-4 text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="tnum font-medium text-ink">{format(Number(data[hover][s.key]) || 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Sparkline — the de-emphasised trend inside a stat tile
 * ------------------------------------------------------------------ */
export function Sparkline({
  values, color = VIZ[0], width = 96, height = 28,
}: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - ((v - min) / span) * (height - 4) - 2])
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className="overflow-visible">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.75" fill={color} stroke={SURFACE} strokeWidth="1.5" />
    </svg>
  )
}
