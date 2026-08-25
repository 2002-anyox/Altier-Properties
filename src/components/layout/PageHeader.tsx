import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { EASE } from '../../lib/motion'

export function PageHeader({
  eyebrow, title, description, actions, breadcrumbs,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
  breadcrumbs?: Array<{ label: string; to?: string }>
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav aria-label="Breadcrumb" className="mb-2.5 flex flex-wrap items-center gap-1 text-[12px] text-ink-muted">
            {breadcrumbs.map((b, i) => (
              <span key={b.label} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} className="text-ink-muted/70" aria-hidden />}
                {b.to ? (
                  <Link to={b.to} className="link-underline transition-colors hover:text-ink">{b.label}</Link>
                ) : (
                  <span className="text-ink-secondary">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && (
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="font-display text-[26px] font-semibold leading-tight text-ink sm:text-[30px]"
        >
          {title}
        </motion.h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
