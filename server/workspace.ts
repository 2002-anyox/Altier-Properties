/* ------------------------------------------------------------------ *
 * Workspaces, seats and invitations
 *
 * A subscription is the only thing that decides how many people can work
 * in a workspace, and this is the only file that reads it. The rule it
 * enforces is the one an owner would describe: a plan comes with a number
 * of seats, everybody who works on the portfolio takes one, and a tenant
 * with a portal login does not — a landlord with two hundred tenants is
 * not buying two hundred seats.
 *
 * A pending invitation holds a seat too. Without that, a three-seat
 * workspace could invite thirty people and only discover the problem when
 * they started accepting.
 * ------------------------------------------------------------------ */

import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { DEFAULT_REMINDERS } from '../src/lib/defaults.js'
import type { Db } from './db/client.js'
import * as t from './db/schema.js'
import {
  ALL_PERMISSIONS, DEFAULT_PERMISSIONS, isLocked, type Permission,
} from '../src/lib/rbac.js'
import type { Role } from '../src/lib/types.js'

/** What each plan comes with. Null seats means unlimited, not a big number. */
export const PLANS = {
  starter: { label: 'Starter', seats: 3 },
  professional: { label: 'Professional', seats: 10 },
  enterprise: { label: 'Enterprise', seats: null },
} as const satisfies Record<string, { label: string; seats: number | null }>

export type Plan = keyof typeof PLANS

/** The roles that do the work, and so take a seat. */
export const STAFF_ROLES = ['owner', 'manager', 'accountant', 'staff'] as const

/** A subscription that has stopped paying can still be read, not added to. */
const OPEN_STATUSES = ['trialing', 'active'] as const

export class SeatLimit extends Error {
  constructor(message: string, readonly usage: SeatUsage) { super(message) }
}
export class NoSubscription extends Error {}

export interface SeatUsage {
  plan: Plan
  planLabel: string
  status: string
  /** Null means unlimited. */
  limit: number | null
  used: number
  /** Null when the limit is. */
  remaining: number | null
  /** Of `used`: how many are people who have not accepted yet. */
  pending: number
  /** Portal logins, listed separately because they are usually free. */
  tenants: number
  tenantsCountAsSeats: boolean
  /** True while the subscription allows anybody new to be added. */
  open: boolean
}

/**
 * What the workspace is paying for and how much of it is spoken for.
 *
 * The seat limit comes from the subscription row rather than from PLANS,
 * so a deal struck with one customer — five seats on Starter — survives a
 * change to the published plans. PLANS is the default the row is created
 * with and the label shown next to it.
 */
export async function seatUsage(db: Db, organizationId: string): Promise<SeatUsage> {
  const [sub] = await db.select().from(t.subscriptions)
    .where(eq(t.subscriptions.organizationId, organizationId))
  if (!sub) throw new NoSubscription('This workspace has no subscription on it.')

  const plan = sub.plan as Plan
  const countsTenants = sub.tenantsCountAsSeats
  const seatRoles: Role[] = countsTenants
    ? [...STAFF_ROLES, 'tenant']
    : [...STAFF_ROLES]

  /* Suspended memberships are deliberately still counted. Suspending
     somebody is a way to stop them working, not a way to get a seat back
     while keeping their record — that is what removing them is for. */
  const [members] = await db.select({
    seats: sql<number>`count(*) filter (where ${t.organizationMembers.role} in ${seatRoles})::int`,
    tenants: sql<number>`count(*) filter (where ${t.organizationMembers.role} = 'tenant')::int`,
  }).from(t.organizationMembers).where(eq(t.organizationMembers.organizationId, organizationId))

  const [invited] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.invitations)
    .where(and(
      eq(t.invitations.organizationId, organizationId),
      eq(t.invitations.status, 'pending'),
      inArray(t.invitations.role, seatRoles),
      sql`${t.invitations.expiresAt} > now()`,
    ))

  const pending = invited?.n ?? 0
  const used = (members?.seats ?? 0) + pending
  const limit = sub.seatLimit
  return {
    plan,
    planLabel: PLANS[plan]?.label ?? plan,
    status: sub.status,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    pending,
    tenants: members?.tenants ?? 0,
    tenantsCountAsSeats: countsTenants,
    open: (OPEN_STATUSES as readonly string[]).includes(sub.status),
  }
}

/**
 * Refuses to add one more person when the plan has no room for them.
 *
 * Thrown rather than returned, because there is no sensible half-measure:
 * an invitation that goes out over the limit is a seat the workspace has
 * not paid for. The message is the one the upgrade prompt shows, so it
 * says what the plan is and what the next one would give.
 */
export async function assertSeatAvailable(db: Db, organizationId: string, role: Role) {
  const usage = await seatUsage(db, organizationId)

  if (!usage.open) {
    throw new SeatLimit(
      usage.status === 'past_due'
        ? 'This workspace has an unpaid invoice, so nobody new can be added until it is settled.'
        : 'This workspace has no active subscription, so nobody new can be added.',
      usage,
    )
  }

  const free = role !== 'tenant' || usage.tenantsCountAsSeats ? false : true
  if (free || usage.limit === null) return usage
  if (usage.used < usage.limit) return usage

  throw new SeatLimit(
    `The ${usage.planLabel} plan covers ${usage.limit} ${usage.limit === 1 ? 'seat' : 'seats'}`
    + ` and all ${usage.used} are taken${usage.pending ? ` (${usage.pending} still to accept)` : ''}.`
    + ` ${upgradeSuggestion(usage.plan)}`,
    usage,
  )
}

/** What to offer somebody who has run out of room. */
export function upgradeSuggestion(plan: Plan): string {
  if (plan === 'starter') return 'Professional raises it to 10; Enterprise removes the limit.'
  if (plan === 'professional') return 'Enterprise removes the limit.'
  return 'Talk to us and we will raise it.'
}

/* --------------------------- memberships --------------------------- */

/** Every workspace this person can open, newest membership last. */
export const membershipsFor = (db: Db, profileId: string) =>
  db.select({
    id: t.organizationMembers.id,
    organizationId: t.organizationMembers.organizationId,
    organizationName: t.organizations.name,
    role: t.organizationMembers.role,
    title: t.organizationMembers.title,
    status: t.organizationMembers.status,
  })
    .from(t.organizationMembers)
    .innerJoin(t.organizations, eq(t.organizations.id, t.organizationMembers.organizationId))
    .where(and(
      eq(t.organizationMembers.profileId, profileId),
      eq(t.organizationMembers.status, 'active'),
    ))
    .orderBy(t.organizationMembers.createdAt)

/**
 * Which workspace to open a new session in.
 *
 * Somebody who owns one workspace and is staff in another should land in
 * their own, so ownership wins; otherwise it is the oldest membership,
 * which is the one they have had longest. Null means they belong nowhere
 * yet — signed in, and with nothing to look at until an owner invites
 * them.
 */
export async function defaultOrganization(db: Db, profileId: string): Promise<string | null> {
  const rows = await membershipsFor(db, profileId)
  if (!rows.length) return null
  return (rows.find((r) => r.role === 'owner') ?? rows[0]!).organizationId
}

/* -------------------------- permissions ---------------------------- *
 * What each role reaches in one workspace. The defaults in
 * src/lib/rbac.ts are the product's opinion; a stored row is a customer
 * disagreeing with it, and the absence of rows is the ordinary case.
 * ------------------------------------------------------------------- */

/**
 * The effective matrix for one workspace: the defaults, with whatever
 * that workspace has changed laid over them.
 *
 * Read per request rather than held in module state, because one server
 * process answers for every customer and a cached matrix would be the
 * wrong one for whoever asked next.
 */
export async function permissionMatrix(
  db: Db, organizationId: string,
): Promise<Record<Role, Permission[]>> {
  const rows = await db.select().from(t.rolePermissions)
    .where(eq(t.rolePermissions.organizationId, organizationId))

  const out = Object.fromEntries(
    Object.entries(DEFAULT_PERMISSIONS).map(([role, list]) => [role, new Set(list)]),
  ) as Record<Role, Set<Permission>>

  for (const row of rows) {
    const role = row.role as Role
    const permission = row.permission as Permission
    if (!out[role]) continue
    if (row.allowed) out[role].add(permission)
    else out[role].delete(permission)
  }

  return Object.fromEntries(
    Object.entries(out).map(([role, set]) => [role, [...set]]),
  ) as Record<Role, Permission[]>
}

/**
 * Changing what a role reaches.
 *
 * Only a departure from the default is stored, so setting something back
 * to its default deletes the row rather than recording agreement. That
 * keeps the table small and, more usefully, means a change to the
 * product's defaults reaches every workspace that never disagreed.
 */
export async function setRolePermission(
  db: Db, organizationId: string, role: Role, permission: Permission, allowed: boolean,
) {
  if (role === 'tenant') {
    throw new BadPermission('A tenant portal login is not a role to grant things to.')
  }
  if (!ALL_PERMISSIONS.includes(permission)) {
    throw new BadPermission(`There is no such permission as ${permission}.`)
  }
  if (isLocked(role, permission) && !allowed) {
    throw new BadPermission(
      'An owner has to keep team and settings access. Taking it away would shut the '
      + 'only door back to this screen.',
    )
  }

  const isDefault = (DEFAULT_PERMISSIONS[role] ?? []).includes(permission) === allowed
  const where = and(
    eq(t.rolePermissions.organizationId, organizationId),
    eq(t.rolePermissions.role, role),
    eq(t.rolePermissions.permission, permission),
  )

  if (isDefault) {
    await db.delete(t.rolePermissions).where(where)
    return
  }

  await db.insert(t.rolePermissions)
    .values({ organizationId, role, permission, allowed })
    .onConflictDoUpdate({
      target: [t.rolePermissions.organizationId, t.rolePermissions.role, t.rolePermissions.permission],
      set: { allowed, updatedAt: new Date() },
    })
}

/** Putting one role, or the whole matrix, back to the product's defaults. */
export async function resetPermissions(db: Db, organizationId: string, role?: Role) {
  await db.delete(t.rolePermissions).where(role
    ? and(
        eq(t.rolePermissions.organizationId, organizationId),
        eq(t.rolePermissions.role, role),
      )
    : eq(t.rolePermissions.organizationId, organizationId))
}

export class BadPermission extends Error {}

/* --------------------------- invitations --------------------------- */

/** Seven days is long enough to reach somebody, short enough to expire. */
const INVITE_DAYS = 7

const digest = (token: string) => createHash('sha256').update(token).digest('hex')

export interface NewInvitation {
  email: string
  name?: string
  role: Role
  title?: string
  propertyIds?: string[]
}

/**
 * Invites somebody, or refuses because there is no seat for them.
 *
 * The seat check comes first and the row is written second, both inside
 * the caller's transaction, so two owners inviting the last seat at the
 * same moment cannot both succeed.
 *
 * The token is returned once, here, and never stored — only its hash is.
 * A copy of the invitations table is therefore not a set of keys.
 */
export async function inviteMember(
  db: Db, organizationId: string, invitedBy: string, input: NewInvitation,
) {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadInvitation('That does not look like an email address.')
  }
  if (input.role === 'tenant') {
    throw new BadInvitation('Tenant portal access is granted from the tenant\'s own record.')
  }

  const already = await db.select({ id: t.organizationMembers.id })
    .from(t.organizationMembers)
    .innerJoin(t.profiles, eq(t.profiles.id, t.organizationMembers.profileId))
    .where(and(
      eq(t.organizationMembers.organizationId, organizationId),
      sql`lower(${t.profiles.email}) = ${email}`,
    ))
  if (already.length) throw new BadInvitation(`${email} is already in this workspace.`)

  const outstanding = await db.select({ id: t.invitations.id })
    .from(t.invitations)
    .where(and(
      eq(t.invitations.organizationId, organizationId),
      eq(t.invitations.status, 'pending'),
      sql`lower(${t.invitations.email}) = ${email}`,
      sql`${t.invitations.expiresAt} > now()`,
    ))
  if (outstanding.length) throw new BadInvitation(`${email} has already been invited.`)

  const usage = await assertSeatAvailable(db, organizationId, input.role)

  const id = `inv-${randomUUID().slice(0, 8)}`
  const token = randomBytes(32).toString('base64url')
  await db.insert(t.invitations).values({
    id,
    organizationId,
    email,
    role: input.role,
    title: input.title?.trim() || '',
    tokenHash: digest(token),
    invitedBy,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  })

  const properties = (input.propertyIds ?? []).filter(Boolean)
  if (properties.length) {
    await db.insert(t.invitationProperties)
      .values(properties.map((propertyId) => ({ invitationId: id, propertyId })))
  }

  return { id, token, email, role: input.role, usage }
}

export class BadInvitation extends Error {}

/** Withdrawing one, which is also how a seat is given back. */
export async function revokeInvitation(db: Db, organizationId: string, id: string) {
  const open = and(
    eq(t.invitations.id, id),
    eq(t.invitations.organizationId, organizationId),
    eq(t.invitations.status, 'pending'),
  )
  const rows = await db.select({ id: t.invitations.id }).from(t.invitations).where(open)
  if (!rows.length) throw new BadInvitation('That invitation is not open any more.')
  await db.update(t.invitations).set({ status: 'revoked' }).where(open)
}

/** What Team & Access lists under "invited". Never the token or its hash. */
export const openInvitations = (db: Db, organizationId: string) =>
  db.select({
    id: t.invitations.id,
    email: t.invitations.email,
    role: t.invitations.role,
    title: t.invitations.title,
    status: t.invitations.status,
    expiresAt: t.invitations.expiresAt,
    createdAt: t.invitations.createdAt,
  })
    .from(t.invitations)
    .where(and(
      eq(t.invitations.organizationId, organizationId),
      eq(t.invitations.status, 'pending'),
    ))
    .orderBy(t.invitations.createdAt)

/**
 * Reading an invitation without accepting it, so the join screen can say
 * whose workspace this is and what it is offering before anybody types a
 * password. Never returns the token, and says nothing about who else is
 * in the workspace.
 */
export async function invitationByToken(db: Db, token: string) {
  const [row] = await db.select({
    id: t.invitations.id,
    organizationId: t.invitations.organizationId,
    organizationName: t.organizations.name,
    email: t.invitations.email,
    role: t.invitations.role,
    title: t.invitations.title,
    status: t.invitations.status,
    expiresAt: t.invitations.expiresAt,
  })
    .from(t.invitations)
    .innerJoin(t.organizations, eq(t.organizations.id, t.invitations.organizationId))
    .where(eq(t.invitations.tokenHash, digest(token)))

  if (!row) throw new BadInvitation('That invitation link is not one we recognise.')
  if (row.status !== 'pending') throw new BadInvitation('That invitation has already been used.')
  if (row.expiresAt.getTime() < Date.now()) {
    await db.update(t.invitations).set({ status: 'expired' }).where(eq(t.invitations.id, row.id))
    throw new BadInvitation('That invitation has expired. Ask for a new one.')
  }
  return row
}

/**
 * Accepting one: the moment somebody actually joins a workspace.
 *
 * Runs unprivileged of no workspace at all — the person accepting is not
 * a member of anything yet, so there is nothing for the policies to scope
 * to — and that is why the token does all the work. It is checked against
 * a hash, it is single use, and the role and workspace come from the row
 * the inviter wrote, never from the request.
 *
 * The seat is checked again here rather than trusted from invitation
 * time, because the workspace may have filled up in the days between.
 */
export async function acceptInvitation(db: Db, token: string, input: {
  name?: string
  passwordHash?: string | null
  profileId?: string
}) {
  const invitation = await invitationByToken(db, token)
  await assertSeatAvailable(db, invitation.organizationId, invitation.role)

  const [existing] = await db.select().from(t.profiles)
    .where(sql`lower(${t.profiles.email}) = ${invitation.email.toLowerCase()}`)

  /* An invitation is addressed to an email, so somebody signed in as a
     different one cannot spend it. */
  if (input.profileId && existing && input.profileId !== existing.id) {
    throw new BadInvitation(`That invitation is for ${invitation.email}.`)
  }

  let profileId = existing?.id
  if (!profileId) {
    profileId = `pr-${randomUUID().slice(0, 12)}`
    await db.insert(t.profiles).values({
      id: profileId,
      name: input.name?.trim() || invitation.email.split('@')[0]!,
      email: invitation.email,
      passwordHash: input.passwordHash ?? null,
      passwordSetAt: input.passwordHash ? new Date() : null,
    })
  } else if (input.passwordHash && !existing?.passwordHash) {
    /* They exist but have never set a password — a shell somebody made
       for them. Accepting is them proving the address is theirs, so this
       is the one moment it can be filled in. */
    await db.update(t.profiles)
      .set({ passwordHash: input.passwordHash, passwordSetAt: new Date() })
      .where(eq(t.profiles.id, profileId))
  }

  const already = await db.select({ id: t.organizationMembers.id })
    .from(t.organizationMembers).where(and(
      eq(t.organizationMembers.organizationId, invitation.organizationId),
      eq(t.organizationMembers.profileId, profileId),
    ))
  if (already.length) throw new BadInvitation('You are already in that workspace.')

  const memberId = `om-${randomUUID().slice(0, 12)}`
  await db.insert(t.organizationMembers).values({
    id: memberId,
    organizationId: invitation.organizationId,
    profileId,
    role: invitation.role,
    title: invitation.title,
    status: 'active',
    since: new Date().toISOString().slice(0, 10),
  })

  /* The properties the inviter picked become the assignments that decide
     what this person's queries return. */
  if (invitation.role === 'manager' || invitation.role === 'staff') {
    const picked = await db.select({ propertyId: t.invitationProperties.propertyId })
      .from(t.invitationProperties)
      .where(eq(t.invitationProperties.invitationId, invitation.id))
    if (picked.length) {
      await db.insert(t.memberProperties)
        .values(picked.map((row) => ({ memberId, propertyId: row.propertyId })))
    }
  }

  await db.update(t.invitations)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(eq(t.invitations.id, invitation.id))

  return { profileId, memberId, organizationId: invitation.organizationId }
}

/* --------------------------- first run ----------------------------- */

/** A slug that is readable, unique, and never empty. */
function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return base || 'workspace'
}

/**
 * Creates a workspace and the first owner in it, in one go.
 *
 * This is the only path that writes an organization, and it runs before
 * anybody is signed in — which is also why it runs unscoped, as the
 * owning role. A request that had already dropped to `altier_app` could
 * not create a workspace it is not yet a member of, and quite right too.
 *
 * The subscription starts as a Starter trial: three seats, which is what
 * a landlord looking at the app for the first time actually needs, and an
 * honest prompt to upgrade the day they need a fourth.
 */
export async function createWorkspace(db: Db, input: {
  organizationName: string
  profileId: string
  name: string
  title?: string
}) {
  const organizationId = `org-${randomUUID().slice(0, 12)}`
  const memberId = `om-${randomUUID().slice(0, 12)}`
  const today = new Date().toISOString().slice(0, 10)

  /* Slugs are unique, and two people can both call their workspace
     "Properties". The suffix is only reached when they do. */
  let slug = slugify(input.organizationName)
  const taken = await db.select({ slug: t.organizations.slug }).from(t.organizations)
    .where(eq(t.organizations.slug, slug))
  if (taken.length) slug = `${slug}-${randomUUID().slice(0, 6)}`

  await db.insert(t.organizations).values({
    id: organizationId,
    name: input.organizationName,
    slug,
  })

  const trialEnds = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  await db.insert(t.subscriptions).values({
    organizationId,
    plan: 'starter',
    status: 'trialing',
    seatLimit: PLANS.starter.seats,
    trialEndsAt: trialEnds,
    currentPeriodStart: today,
    currentPeriodEnd: trialEnds,
  })

  await db.insert(t.organizationMembers).values({
    id: memberId,
    organizationId,
    profileId: input.profileId,
    role: 'owner',
    title: input.title?.trim() || 'Owner',
    status: 'active',
    since: today,
  })

  const r = DEFAULT_REMINDERS
  await db.insert(t.reminderSettings).values({
    organizationId,
    rentDueLeadDays: r.rentDueLeadDays,
    leaseExpiryLeadDays: r.leaseExpiryLeadDays,
    checkInLeadHours: r.checkInLeadHours,
    vacancyAlertDays: r.vacancyAlertDays,
    maintenanceLeadDays: r.maintenanceLeadDays,
    channels: r.channels,
    quietHoursEnabled: r.quietHours.enabled,
    quietHoursFrom: r.quietHours.from,
    quietHoursTo: r.quietHours.to,
    digest: r.digest,
  })

  return { organizationId, memberId, slug }
}
