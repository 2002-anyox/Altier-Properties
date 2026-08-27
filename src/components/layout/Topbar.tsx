import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell, Check, ChevronDown, KeyRound, LogOut, Menu, Moon, Search, Sun, UserCog,
} from 'lucide-react'
import clsx from 'clsx'
import { currentMember, useStore } from '../../lib/store.js'
import { ROLES, roleLabel } from '../../lib/rbac.js'
import { t } from '../../lib/strings.js'
import { Avatar, Button, IconButton, cx } from '../ui'
import { popVariants, spring } from '../../lib/motion.js'
import { relativeDay } from '../../lib/format.js'
import type { NotificationPriority } from '../../lib/types.js'

const PRIORITY_DOT: Record<NotificationPriority, string> = {
  critical: 'bg-status-critical',
  high: 'bg-status-serious',
  normal: 'bg-status-info',
  low: 'bg-ink-muted',
}

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { state, dispatch, theme, toggleTheme, setPaletteOpen, toast, signOut } = useStore()
  const [bellOpen, setBellOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const navigate = useNavigate()

  /* Both menus are dismissible from the keyboard, not just by clicking away. */
  useEffect(() => {
    if (!bellOpen && !roleOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setBellOpen(false); setRoleOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bellOpen, roleOpen])

  const unread = useMemo(() => state.notifications.filter((n) => !n.read), [state.notifications])
  const me = currentMember(state)

  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-16 w-full max-w-full items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <IconButton label={t('action.openNav')} onClick={onOpenNav} className="lg:hidden">
          <Menu size={19} />
        </IconButton>

        <button
          onClick={() => setPaletteOpen(true)}
          className="group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface-card px-3 text-left text-sm text-ink-muted transition-colors duration-200 hover:border-line-strong sm:max-w-md"
        >
          <Search size={15} className="shrink-0" aria-hidden />
          <span className="flex-1 truncate">{t('action.search')}</span>
          <kbd className="hidden rounded-md border border-line bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-medium sm:block">⌘K</kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <IconButton label={theme === 'dark' ? t('action.themeLight') : t('action.themeDark')} onClick={toggleTheme}>
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
            <IconButton label={`${t('action.notifications')}, ${unread.length} ${t('action.unread')}`} onClick={() => { setBellOpen((v) => !v); setRoleOpen(false) }}>
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
                    className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]"
                  >
                    <div className="flex items-center justify-between border-b border-line px-4 py-3">
                      <div>
                        <p className="text-[13.5px] font-semibold text-ink">{t('action.notifications')}</p>
                        <p className="text-[11.5px] text-ink-muted">{unread.length} {t('action.unread')}</p>
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { dispatch({ type: 'mark-all-read' }); toast({ title: 'All caught up', tone: 'success' }) }}
                      >
                        <Check size={13} /> {t('action.markAllRead')}
                      </Button>
                    </div>
                    <ul className="max-h-[min(420px,55vh)] divide-y divide-[rgb(var(--c-border))] overflow-y-auto overscroll-contain">
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
                        {t('action.openCentre')}
                      </Link>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Signed in: who you are, and the way out. Signed out (demo only):
              the role switcher, which demonstrates the access model. */}
          <div className="relative">
            <button
              onClick={() => { setRoleOpen((v) => !v); setBellOpen(false) }}
              className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-card pl-1.5 pr-2.5 transition-colors hover:border-line-strong"
              aria-haspopup="menu"
              aria-expanded={roleOpen}
            >
              <Avatar name={state.member?.name ?? me.name} size={28} tone="navy" />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[12.5px] font-medium text-ink">{(state.member?.name ?? me.name).split(' ')[0]}</span>
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
                    className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[300px]"
                    role="menu"
                  >
                    <div className="border-b border-line px-4 py-3">
                      {state.member ? (
                        <>
                          <p className="truncate text-[13px] font-medium text-ink">{state.member.name}</p>
                          <p className="truncate text-[11.5px] text-ink-muted">{state.member.email}</p>
                          <p className="mt-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-muted">
                            {roleLabel(state.role)}
                          </p>
                        </>
                      ) : (
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                          <UserCog size={12} /> {t('action.viewAs')}
                        </p>
                      )}
                    </div>

                    {state.member ? (
                      <div className="p-1.5">
                        <Link
                          to="/settings"
                          role="menuitem"
                          onClick={() => setRoleOpen(false)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-ink-secondary transition-colors hover:bg-surface-inset hover:text-ink"
                        >
                          <KeyRound size={15} /> Change password
                        </Link>
                        <button
                          role="menuitem"
                          onClick={() => { setRoleOpen(false); void signOut() }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-ink-secondary transition-colors hover:bg-surface-inset hover:text-ink"
                        >
                          <LogOut size={15} /> Sign out
                        </button>
                      </div>
                    ) : (
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
                    )}
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
