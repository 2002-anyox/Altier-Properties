/* ------------------------------------------------------------------ *
 * The sections, within reach of a thumb
 *
 * On a phone every part of this app used to live behind a hamburger: two
 * taps and a drawer to reach the payments you opened the app to chase,
 * with the control to do it in the top-left corner — the furthest point
 * on the screen from the hand holding it.
 *
 * So the top-level sections come out of the drawer and sit along the
 * bottom edge, which is the platform convention on a phone and is where
 * the thumb already is. Four of them plus a way to the rest; the drawer
 * stays, and More is now the only thing that opens it.
 *
 * Which four depends on what the person is allowed to see — a staff
 * member with no access to the ledger should not be given a tab that
 * refuses them — so the order below is a preference, not a guarantee,
 * and the first four they can actually use are the ones drawn.
 * ------------------------------------------------------------------- */
import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { NAV, type NavItem } from './nav.js'
import { can } from '../../lib/rbac.js'
import { useStore } from '../../lib/store.js'
import { t } from '../../lib/strings.js'

/** The order sections are offered a tab in, best first. */
const PREFERRED = ['/', '/properties', '/bookings', '/payments', '/availability', '/clients']

const ALL: NavItem[] = NAV.flatMap((g) => g.items)

export function TabBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { state } = useStore()

  const counts = {
    notifications: state.notifications.filter((n) => !n.read).length,
    overdue: state.invoices.filter((i) => i.status === 'overdue' || i.status === 'partial').length,
    maintenance: state.maintenance.filter(
      (m) => m.status !== 'completed' && (m.priority === 'urgent' || m.priority === 'high')).length,
  }

  const tabs = PREFERRED
    .map((to) => ALL.find((i) => i.to === to))
    .filter((i): i is NavItem => !!i && can(state.role, i.permission) && !i.superAdmin)
    .slice(0, 4)

  if (!tabs.length) return null

  return (
    <nav
      aria-label="Sections"
      /* Above the content, below the modals and the toaster. The padding
         clears the home indicator on a phone that has one, and is zero on
         one that does not. */
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex items-stretch">
        {tabs.map((item) => {
          const Icon = item.icon
          const badge = item.badge ? counts[item.badge] : 0
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => clsx(
                  /* 56px, comfortably past the 44 Apple asks for, and the
                     whole cell is the target rather than just the glyph. */
                  'relative flex h-14 flex-col items-center justify-center gap-1 px-1 transition-colors',
                  isActive ? 'text-gold-text' : 'text-ink-muted',
                )}
              >
                {({ isActive }) => (
                  <>
                    {/* The selected tab is marked three ways — a rule, a
                        colour and a weight — because colour alone is not a
                        way to tell somebody where they are. */}
                    <span
                      aria-hidden
                      className={clsx(
                        'absolute inset-x-5 top-0 h-[2px] rounded-full transition-opacity',
                        isActive ? 'bg-gold opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="relative">
                      <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                      {/* The critical fill is a deep red in light mode and a
                          bright one in dark, so the ink flips with it: white is
                          6.28:1 on the first and 3.35:1 on the second. */}
                      {badge > 0 && (
                        <span className="tnum absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-critical px-1 text-[11px] font-bold leading-none text-white dark:text-navy-950">
                          {badge > 9 ? '9+' : badge}
                          <span className="sr-only"> needing attention</span>
                        </span>
                      )}
                    </span>
                    <span className={clsx('text-[11px] leading-none', isActive && 'font-semibold')}>
                      {t(item.tabKey ?? item.labelKey)}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          )
        })}

        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenNav}
            className="flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-ink-muted transition-colors"
          >
            <MoreHorizontal size={20} strokeWidth={1.8} aria-hidden />
            <span className="text-[11px] leading-none">{t('nav.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
