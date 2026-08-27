import React, { useMemo } from 'react'
import clsx from 'clsx'
import type { PropertyType } from '../lib/types.js'

/* Photography stands in for the real thing with a deterministic
   architectural composition — self-contained SVG, no network, and it
   reads as a considered brand asset rather than a grey box. */

const PALETTES: Array<{ sky: [string, string]; mass: string; face: string; accent: string }> = [
  { sky: ['#243244', '#0F1620'], mass: '#0B111A', face: '#1B2635', accent: '#CBA85F' },
  { sky: ['#3A4356', '#1A2130'], mass: '#121A26', face: '#232E3E', accent: '#D9BE84' },
  { sky: ['#4A4335', '#20242F'], mass: '#141A24', face: '#1F2A38', accent: '#E0C88F' },
  { sky: ['#2E4152', '#131C27'], mass: '#0E1620', face: '#1D2937', accent: '#C7A05A' },
  { sky: ['#514A3C', '#232A36'], mass: '#161D28', face: '#26313F', accent: '#E6D0A2' },
]

function rngFrom(seed: number) {
  let s = seed || 1
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function PropertyImage({
  seed, type, className, rounded = 'rounded-t-2xl',
}: { seed: number; type: PropertyType; className?: string; rounded?: string }) {
  const art = useMemo(() => {
    const r = rngFrom(seed * 7919 + 13)
    const pal = PALETTES[seed % PALETTES.length]
    const towers = type === 'villa' || type === 'house' ? 3 : type === 'commercial' ? 4 : 5

    const blocks = Array.from({ length: towers }, (_, i) => {
      const w = 14 + r() * 22
      const x = (i / towers) * 100 + r() * 6
      const low = type === 'villa' || type === 'house' ? 22 : type === 'commercial' ? 46 : 38
      const h = low + r() * (type === 'commercial' ? 34 : 40)
      const cols = Math.max(2, Math.round(w / 6))
      const rows = Math.max(2, Math.round(h / 9))
      return { x, w, h, cols, rows, lit: Array.from({ length: cols * rows }, () => r() > 0.52) }
    })
    return { pal, blocks, hasMoon: r() > 0.4, moonX: 60 + r() * 28 }
  }, [seed, type])

  const gid = `pi-${seed}`

  return (
    <div className={clsx('relative overflow-hidden bg-navy-900', rounded, className)}>
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMax slice" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={art.pal.sky[0]} />
            <stop offset="100%" stopColor={art.pal.sky[1]} />
          </linearGradient>
          <linearGradient id={`${gid}-glow`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={art.pal.accent} stopOpacity="0.20" />
            <stop offset="100%" stopColor={art.pal.accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width="200" height="120" fill={`url(#${gid}-sky)`} />
        {art.hasMoon && <circle cx={art.moonX} cy="24" r="9" fill={art.pal.accent} opacity="0.30" />}
        <rect y="52" width="200" height="68" fill={`url(#${gid}-glow)`} />

        {art.blocks.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={120 - b.h} width={b.w} height={b.h} fill={i % 2 ? art.pal.face : art.pal.mass} rx="1" />
            {Array.from({ length: b.rows }).map((_, ri) =>
              Array.from({ length: b.cols }).map((__, ci) => {
                const on = b.lit[ri * b.cols + ci]
                return (
                  <rect
                    key={`${ri}-${ci}`}
                    x={b.x + 2.5 + ci * ((b.w - 4) / b.cols)}
                    y={120 - b.h + 4 + ri * ((b.h - 6) / b.rows)}
                    width={Math.max(1.4, (b.w - 4) / b.cols - 1.6)}
                    height={Math.max(1.8, (b.h - 6) / b.rows - 2.4)}
                    fill={on ? art.pal.accent : '#FFFFFF'}
                    opacity={on ? 0.55 : 0.06}
                  />
                )
              }),
            )}
          </g>
        ))}

        <rect y="112" width="200" height="8" fill="#000" opacity="0.25" />
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-950/55 via-transparent to-transparent" />
    </div>
  )
}
