import { motion } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { NAV } from './nav'
import { Wordmark } from './Wordmark'
import { currentMember, useStore } from '../../lib/store'
import { can, roleLabel } from '../../lib/rbac'
import { t } from '../../lib/strings'
import { Avatar, IconButton } from '../ui'
import { spring } from '../../lib/motion'

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state } = useStore()
  const location = useLocation()
  const me = currentMember(state)

  const counts = {
    notifications: state.notifications.filter((n) => !n.read).length,
    overdue: state.invoices.filter((i) => i.status === 'overdue' || i.status === 'partial').length,
    maintenance: state.maintenance.filter((m) => m.status !== 'completed' && (m.priority === 'urgent' || m.priority === 'high')).length,
  }

  return (
    <div className="rail-gradient flex h-full flex-col">
      <div className="px-5 pb-5 pt-5">
        <Wordmark />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {NAV.map((group) => {
          const items = group.items.filter((i) => can(state.role, i.permission))
          if (!items.length) return null
          return (
            <div key={group.sectionKey} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--c-text-onrail-muted))]">
                {t(group.sectionKey)}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
                  const badge = item.badge ? counts[item.badge] : 0
                  const Icon = item.icon
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onNavigate}
                        title={item.hint}
                        className={clsx(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-200',
                          active
                            ? 'text-[rgb(var(--c-text-onrail))]'
                            : 'text-[rgb(var(--c-text-onrail-muted))] hover:text-[rgb(var(--c-text-onrail))]',
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="rail-active"
                            transition={spring}
                            className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-inset ring-white/[0.06]"
                          />
                        )}
                        {active && (
                          <motion.span
                            layoutId="rail-marker"
                            transition={spring}
                            className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-gold"
                          />
                        )}
                        <Icon size={17} className={clsx('relative z-10 shrink-0 transition-colors', active ? 'text-gold' : 'text-current')} />
                        <span className="relative z-10 flex-1 truncate">{t(item.labelKey)}</span>
                        {badge > 0 && (
                          <span
                            className={clsx(
                              'tnum relative z-10 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold',
                              item.badge === 'overdue' || item.badge === 'maintenance'
                                ? 'bg-[rgb(var(--c-status-critical)/0.22)] text-[#F0A9A9]'
                                : 'bg-gold text-navy-950',
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.07] px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} size={34} tone="gold" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-[rgb(var(--c-text-onrail))]">{me.name}</p>
            <p className="truncate text-[11.5px] text-[rgb(var(--c-text-onrail-muted))]">{roleLabel(state.role)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={clsx('fixed inset-0 z-[80] overflow-hidden lg:hidden', !open && 'pointer-events-none')}>
      <motion.div
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-navy-950/55 backdrop-blur-[2px]"
      />
      <motion.div
        initial={false}
        animate={{ x: open ? 0 : '-100%' }}
        transition={spring}
        className="absolute inset-y-0 left-0 w-[min(280px,84vw)] shadow-rail"
      >
        <SidebarContent onNavigate={onClose} />
        <div className="absolute right-3 top-4">
          <IconButton label={t('action.closeNav')} onClick={onClose} className="text-[rgb(var(--c-text-onrail-muted))] hover:bg-white/10 hover:text-white">
            <X size={18} />
          </IconButton>
        </div>
      </motion.div>
    </div>
  )
}
