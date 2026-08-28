import type { Role } from './types.js'

export const ROLES: Array<{ id: Role; label: string; blurb: string }> = [
  { id: 'owner', label: 'Owner', blurb: 'Full portfolio, finances and team access' },
  { id: 'manager', label: 'Property Manager', blurb: 'Properties, bookings, clients and maintenance' },
  { id: 'staff', label: 'Staff', blurb: 'Operations: turnovers, maintenance and check-ins' },
  { id: 'accountant', label: 'Accountant', blurb: 'Payments, invoices and financial reporting' },
  { id: 'tenant', label: 'Tenant or guest', blurb: 'Portal access to their own agreement and charges' },
]

/** The roles an owner can hand out from Team & Access. A tenant login is
 *  created from the tenant's own record, not from the staff list. */
export const STAFF_ROLE_OPTIONS = ROLES.filter((r) => r.id !== 'tenant')

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
  /* A tenant reaches the same endpoints as everybody else and sees almost
     nothing through them: the database returns only the rows that name
     them. The short list here is the second lock, not the first — it
     keeps a tenant out of the routes that have no per-person answer at
     all, like the team list and the settings.
     Maintenance is absent on purpose. A job records who reported it as a
     name typed into a box rather than a link to anybody, so there is no
     honest "their own" to hand a tenant, and handing them the building's
     is handing them their neighbours'. */
  tenant: [
    'view:dashboard', 'view:bookings', 'view:payments',
  ],
}

export const can = (role: Role, permission: Permission) => MATRIX[role].includes(permission)

export const roleLabel = (role: Role) => ROLES.find((r) => r.id === role)?.label ?? role
