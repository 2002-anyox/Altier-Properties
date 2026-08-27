import type { Role } from './types.js'

export const ROLES: Array<{ id: Role; label: string; blurb: string }> = [
  { id: 'owner', label: 'Owner', blurb: 'Full portfolio, finances and team access' },
  { id: 'manager', label: 'Property Manager', blurb: 'Properties, bookings, clients and maintenance' },
  { id: 'staff', label: 'Staff', blurb: 'Operations: turnovers, maintenance and check-ins' },
  { id: 'accountant', label: 'Accountant', blurb: 'Payments, invoices and financial reporting' },
]

/** Every permission the UI gates on. Kept flat and readable on purpose. */
export type Permission =
  | 'view:dashboard'
  | 'view:properties'
  | 'edit:properties'
  | 'view:calendar'
  | 'view:bookings'
  | 'edit:bookings'
  | 'view:clients'
  | 'edit:clients'
  | 'view:payments'
  | 'edit:payments'
  | 'view:maintenance'
  | 'edit:maintenance'
  | 'view:reports'
  | 'view:financials'
  | 'manage:team'
  | 'manage:settings'

const MATRIX: Record<Role, Permission[]> = {
  owner: [
    'view:dashboard', 'view:properties', 'edit:properties', 'view:calendar', 'view:bookings',
    'edit:bookings', 'view:clients', 'edit:clients', 'view:payments', 'edit:payments',
    'view:maintenance', 'edit:maintenance', 'view:reports', 'view:financials', 'manage:team', 'manage:settings',
  ],
  manager: [
    'view:dashboard', 'view:properties', 'edit:properties', 'view:calendar', 'view:bookings',
    'edit:bookings', 'view:clients', 'edit:clients', 'view:payments', 'view:maintenance',
    'edit:maintenance', 'view:reports', 'view:financials', 'manage:settings',
  ],
  staff: [
    'view:dashboard', 'view:properties', 'view:calendar', 'view:bookings', 'view:clients',
    'view:maintenance', 'edit:maintenance', 'manage:settings',
  ],
  accountant: [
    'view:dashboard', 'view:properties', 'view:calendar', 'view:bookings', 'view:clients',
    'view:payments', 'edit:payments', 'view:reports', 'view:financials', 'manage:settings',
  ],
}

export const can = (role: Role, permission: Permission) => MATRIX[role].includes(permission)

export const roleLabel = (role: Role) => ROLES.find((r) => r.id === role)?.label ?? role
