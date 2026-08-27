import {
  BellRing, Building2, CalendarRange, ClipboardList, CreditCard, LayoutDashboard,
  PieChart, Settings, Users, Wrench,
} from 'lucide-react'
import type { Permission } from '../../lib/rbac.js'

export interface NavItem {
  to: string
  /** Translation key; resolved at render so language can change live. */
  labelKey: string
  icon: typeof Building2
  permission: Permission
  /** Shown as a count pill in the rail. */
  badge?: 'notifications' | 'overdue' | 'maintenance'
  hint: string
}

/* Organised by object, not by department — a manager thinks
   "the calendar", never "the leasing module". */
export const NAV: Array<{ sectionKey: string; items: NavItem[] }> = [
  {
    sectionKey: 'nav.overview',
    items: [
      { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: 'view:dashboard', hint: 'Portfolio at a glance' },
      { to: '/availability', labelKey: 'nav.availability', icon: CalendarRange, permission: 'view:calendar', hint: 'Calendar and free units' },
    ],
  },
  {
    sectionKey: 'nav.portfolio',
    items: [
      { to: '/properties', labelKey: 'nav.properties', icon: Building2, permission: 'view:properties', hint: 'Every unit and listing' },
      { to: '/bookings', labelKey: 'nav.bookings', icon: ClipboardList, permission: 'view:bookings', hint: 'Long lets and short stays' },
      { to: '/clients', labelKey: 'nav.clients', icon: Users, permission: 'view:clients', hint: 'Tenants, guests and companies' },
    ],
  },
  {
    sectionKey: 'nav.operations',
    items: [
      { to: '/payments', labelKey: 'nav.payments', icon: CreditCard, permission: 'view:payments', badge: 'overdue', hint: 'Invoices and due dates' },
      { to: '/maintenance', labelKey: 'nav.maintenance', icon: Wrench, permission: 'view:maintenance', badge: 'maintenance', hint: 'Jobs, vendors and costs' },
      { to: '/notifications', labelKey: 'nav.notifications', icon: BellRing, permission: 'view:dashboard', badge: 'notifications', hint: 'Reminders and alerts' },
    ],
  },
  {
    sectionKey: 'nav.insight',
    items: [
      { to: '/reports', labelKey: 'nav.reports', icon: PieChart, permission: 'view:reports', hint: 'Occupancy, revenue, performance' },
      { to: '/settings', labelKey: 'nav.settings', icon: Settings, permission: 'manage:settings', hint: 'Team, roles and reminders' },
    ],
  },
]
