import {
  BellRing, Building2, CalendarRange, ClipboardList, CreditCard, LayoutDashboard,
  PieChart, Settings, Users, Wrench,
} from 'lucide-react'
import type { Permission } from '../../lib/rbac'

export interface NavItem {
  to: string
  label: string
  icon: typeof Building2
  permission: Permission
  /** Shown as a count pill in the rail. */
  badge?: 'notifications' | 'overdue' | 'maintenance'
  hint: string
}

/* Organised by object, not by department — a manager thinks
   "the calendar", never "the leasing module". */
export const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'view:dashboard', hint: 'Portfolio at a glance' },
      { to: '/availability', label: 'Availability', icon: CalendarRange, permission: 'view:calendar', hint: 'Calendar and free units' },
    ],
  },
  {
    section: 'Portfolio',
    items: [
      { to: '/properties', label: 'Properties', icon: Building2, permission: 'view:properties', hint: 'Every unit and listing' },
      { to: '/bookings', label: 'Bookings & leases', icon: ClipboardList, permission: 'view:bookings', hint: 'Long lets and short stays' },
      { to: '/clients', label: 'Clients', icon: Users, permission: 'view:clients', hint: 'Tenants, guests and companies' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/payments', label: 'Payments', icon: CreditCard, permission: 'view:payments', badge: 'overdue', hint: 'Invoices and due dates' },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench, permission: 'view:maintenance', badge: 'maintenance', hint: 'Jobs, vendors and costs' },
      { to: '/notifications', label: 'Notifications', icon: BellRing, permission: 'view:dashboard', badge: 'notifications', hint: 'Reminders and alerts' },
    ],
  },
  {
    section: 'Insight',
    items: [
      { to: '/reports', label: 'Reports', icon: PieChart, permission: 'view:reports', hint: 'Occupancy, revenue, performance' },
      { to: '/settings', label: 'Settings', icon: Settings, permission: 'manage:settings', hint: 'Team, roles and reminders' },
    ],
  },
]
