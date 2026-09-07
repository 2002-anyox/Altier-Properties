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

const DEFAULTS: Record<Role, Permission[]> = {
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

/** Every permission there is, in the order Settings lists them. */
export const ALL_PERMISSIONS = [...new Set(Object.values(DEFAULTS).flat())] as Permission[]

/**
 * What each role reaches here, as opposed to by default.
 *
 * The defaults above are the product's opinion; a workspace can disagree,
 * and this holds whatever it has decided. Held as module state and
 * replaced wholesale, the same way the currency presentation is, because
 * `can()` is called from render paths all over the app and threading a
 * matrix through every one of them would be a worse trade than this.
 *
 * The browser holds one workspace at a time, so there is nothing here to
 * confuse. The server does not use this — it reads the matrix per
 * request, because one process serves every customer.
 */
let matrix: Record<Role, Set<Permission>> = asSets(DEFAULTS)

function asSets(source: Record<Role, Permission[]>): Record<Role, Set<Permission>> {
  return Object.fromEntries(
    Object.entries(source).map(([role, list]) => [role, new Set(list)]),
  ) as Record<Role, Set<Permission>>
}

/** The defaults, for a workspace that has never changed anything. */
export const DEFAULT_PERMISSIONS = DEFAULTS

/** Applies a workspace's matrix. Anything absent falls back to default. */
export function setPermissions(next: Partial<Record<Role, Permission[]>> | null | undefined) {
  matrix = asSets(DEFAULTS)
  if (!next) return
  for (const [role, list] of Object.entries(next)) {
    if (list) matrix[role as Role] = new Set(list)
  }
}

export const can = (role: Role, permission: Permission) =>
  matrix[role]?.has(permission) ?? false

/** What one role reaches, for drawing the matrix. */
export const permissionsFor = (role: Role): Permission[] =>
  ALL_PERMISSIONS.filter((p) => matrix[role]?.has(p))

/**
 * Permissions an owner cannot give away.
 *
 * Removing team management from the owner role locks every owner out of
 * the screen that would put it back — a door that shuts from the inside
 * with the key on the outside. Refused in the interface and again on the
 * server, because the interface is not where refusals belong.
 */
export const LOCKED: Array<{ role: Role; permission: Permission }> = [
  { role: 'owner', permission: 'manage:team' },
  { role: 'owner', permission: 'manage:settings' },
]

export const isLocked = (role: Role, permission: Permission) =>
  LOCKED.some((l) => l.role === role && l.permission === permission)

export const roleLabel = (role: Role) => ROLES.find((r) => r.id === role)?.label ?? role
