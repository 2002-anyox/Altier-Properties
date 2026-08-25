import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell, Check, ChevronDown, Menu, Moon, Search, Sun, UserCog,
} from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../../lib/store'
import { ROLES, roleLabel } from '../../lib/rbac'
import { Avatar, Button, IconButton, cx } from '../ui'
import { popVariants, spring } from '../../lib/motion'
import { relativeDay } from '../../lib/format'
import type { NotificationPriority } from '../../lib/types'

const PRIORITY_DOT: Record<NotificationPriority, string> = {
  critical: 'bg-status-critical',
  high: 'bg-status-serious',
  normal: 'bg-status-info',
  low: 'bg-ink-muted',
}

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { state, dispatch, theme, toggleTheme, setPaletteOpen, toast } = useStore()
  const [bellOpen, setBellOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const navigate = useNavigate()

  const unread = useMemo(() => state.notifications.filter((n) => !n.read), [state.notifications])
  const me = state.team.find((t) => t.id === state.currentUserId) ?? state.team[0]

  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-16 w-full max-w-full items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <IconButton label="Open navigation" onClick={onOpenNav} className="lg:hidden">
          <Menu size={19} />
        </IconButton>

        <button
          onClick={() => setPaletteOpen(true)}
          className="group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface-card px-3 text-left text-sm text-ink-muted transition-colors duration-200 hover:border-line-strong sm:max-w-md"
        >
          <Search size={15} className="shrink-0" aria-hidden />
          <span className="flex-1 truncate">Search properties, clients, invoices…</span>
          <kbd className="hidden rounded-md border border-line bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-medium sm:block">⌘K</kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ opacity: 0, rotate: -35, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 35, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="block"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </motion.span>
            </AnimatePresence>
          </IconButton>

          {/* Notifications */}
          <div className="relative">
            <IconButton label={`Notifications, ${unread.length} unread`} onClick={() => { setBellOpen((v) => !v); setRoleOpen(false) }}>
              <Bell size={17} />
              {unread.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={spring}
                  className="tnum absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9.5px] font-bold text-white dark:text-navy-950"
                >
                  {unread.length > 9 ? '9+' : unread.length}
                </motion.span>
              )}
            </IconButton>
            <AnimatePresence>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} aria-hidden />
                  <motion.div
                    variants={popVariants} initial="initial" animate="animate" exit="exit"
                    className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift"
                  >
                    <div className="flex items-center justify-between border-b border-line px-4 py-3">
                      <div>
                        <p className="text-[13.5px] font-semibold text-ink">Notifications</p>
                        <p className="text-[11.5px] text-ink-muted">{unread.length} unread</p>
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { dispatch({ type: 'mark-all-read' }); toast({ title: 'All caught up', tone: 'success' }) }}
                      >
                        <Check size={13} /> Mark all read
                      </Button>
                    </div>
                    <ul className="max-h-[min(420px,60vh)] divide-y divide-[rgb(var(--c-border))] overflow-y-auto">
                      {state.notifications.slice(0, 8).map((n) => (
                        <li key={n.id}>
                          <button
                            onClick={() => { dispatch({ type: 'mark-read', id: n.id }); setBellOpen(false); navigate('/notifications') }}
                            className={cx('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-inset', !n.read && 'bg-gold-soft/30')}
                          >
                            <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[n.priority])} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-ink">{n.title}</span>
                              <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{n.body}</span>
                              <span className="mt-1 block text-[11px] text-ink-muted">{relativeDay(n.createdAt)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-line p-2">
                      <Link
                        to="/notifications" onClick={() => setBellOpen(false)}
                        className="block rounded-xl px-3 py-2 text-center text-[13px] font-medium text-ink-secondary transition-colors hover:bg-surface-inset hover:text-ink"
                      >
                        Open notification centre
                      </Link>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Role switcher — role-based access is a first-class demo control */}
          <div className="relative">
            <button
              onClick={() => { setRoleOpen((v) => !v); setBellOpen(false) }}
              className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-card pl-1.5 pr-2.5 transition-colors hover:border-line-strong"
              aria-haspopup="menu"
              aria-expanded={roleOpen}
            >
              <Avatar name={me.name} size={28} tone="navy" />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[12.5px] font-medium text-ink">{me.name.split(' ')[0]}</span>
                <span className="block text-[10.5px] text-ink-muted">{roleLabel(state.role)}</span>
              </span>
              <ChevronDown size={14} className={clsx('text-ink-muted transition-transform duration-200', roleOpen && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {roleOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setRoleOpen(false)} aria-hidden />
                  <motion.div
                    variants={popVariants} initial="initial" animate="animate" exit="exit"
                    className="absolute right-0 z-50 mt-2 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift"
                    role="menu"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                        <UserCog size={12} /> View as
                      </p>
                    </div>
                    <ul className="p-1.5">
                      {ROLES.map((r) => (
                        <li key={r.id}>
                          <button
                            role="menuitem"
                            onClick={() => {
                              dispatch({ type: 'set-role', role: r.id })
                              setRoleOpen(false)
                              navigate('/')
                              toast({ title: `Now viewing as ${r.label}`, body: r.blurb, tone: 'default' })
                            }}
                            className={cx(
                              'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-inset',
                              state.role === r.id && 'bg-gold-soft/40',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium text-ink">{r.label}</span>
                              <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-muted">{r.blurb}</span>
                            </span>
                            {state.role === r.id && <Check size={15} className="mt-0.5 shrink-0 text-gold" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  )
}
