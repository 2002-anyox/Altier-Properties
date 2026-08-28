/* ------------------------------------------------------------------ *
 * API client
 *
 * Three states, and the app says which one it is in rather than papering
 * over the difference:
 *
 *   database    — an API answered, so the portfolio is real and every
 *                 change is written back
 *   unreachable — there should be an API and there is not, which is a
 *                 fault to report, not a reason to invent records
 *   demo        — the single-file build, which has no server by design
 *                 and carries a sample portfolio inside it
 *
 * Only `--mode single` produces the demo. A normal build never falls back
 * to sample data: showing somebody twenty-four properties they do not own,
 * because a connection string was wrong, is worse than showing nothing.
 * ------------------------------------------------------------------ */

import {
  BOOKINGS, CLIENTS, DEFAULT_REMINDERS, INVOICES, MAINTENANCE, PROPERTIES, TEAM,
} from './data.js'
import type { Booking, Client, Invoice, Portfolio, Property, Role, TeamMember } from './types.js'

export type DataSource = 'database' | 'demo' | 'unreachable'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const STANDALONE = import.meta.env.MODE === 'single'
const PROBE_TIMEOUT_MS = 4000

/** The sample portfolio, reachable only from the single-file build. */
export const demoPortfolio = (): Portfolio => ({
  properties: PROPERTIES,
  clients: CLIENTS,
  bookings: BOOKINGS,
  invoices: INVOICES,
  maintenance: MAINTENANCE,
  team: TEAM,
  reminders: DEFAULT_REMINDERS,
})

/** True only for the `--mode single` build, which ships its own portfolio. */
export const IS_DEMO_BUILD = STANDALONE

/**
 * What the app holds before anything has been fetched. Empty everywhere
 * except the single-file demo, which has no server to fetch from.
 */
export const initialPortfolio = (): Portfolio =>
  (STANDALONE ? demoPortfolio() : emptyPortfolio())

/**
 * Nothing at all, which is what a new deployment holds and what the app
 * shows anybody who is not signed in. Reminder settings are the exception:
 * they are a settings row rather than a record, and every screen that
 * reads them would otherwise have to guard against their absence.
 */
export const emptyPortfolio = (): Portfolio => ({
  properties: [],
  clients: [],
  bookings: [],
  invoices: [],
  maintenance: [],
  team: [],
  reminders: DEFAULT_REMINDERS,
})

/** A 404 page can be perfectly valid HTML; only a real payload counts. */
function isPortfolio(value: unknown): value is Portfolio {
  const p = value as Portfolio | null
  return !!p && Array.isArray(p.properties) && Array.isArray(p.invoices)
    && Array.isArray(p.clients) && !!p.reminders
}

/** A failure the caller may want to distinguish, not just report. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seat figures, when the refusal was the subscription's doing. */
    readonly seats?: SeatUsage,
  ) { super(message) }
}

/**
 * The plan is full, or lapsed. Worth its own question because the answer
 * is an upgrade prompt rather than an error: nothing went wrong, the
 * workspace simply has no room for another person.
 */
export const needsUpgrade = (error: unknown) =>
  error instanceof ApiError && error.status === 402

/** Signed out mid-session. The store listens for this and shows the door. */
export const isSignedOut = (error: unknown) =>
  error instanceof ApiError && error.status === 401

async function send(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // The session cookie is httpOnly; the browser attaches it, not us.
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const failure = body as { error?: string; seats?: SeatUsage } | null
    throw new ApiError(
      failure?.error ?? `Request failed (${res.status})`,
      res.status,
      failure?.seats,
    )
  }
  return body
}

async function request(path: string, init?: RequestInit): Promise<Portfolio> {
  const body = await send(path, init)
  if (!isPortfolio(body)) throw new Error('The server returned an unexpected response.')
  return body
}

/** Loads the portfolio, falling back to the bundled demo data. */
/**
 * Is there an API here at all, and if so who are we.
 *
 * Kept separate from loading the portfolio because the answers differ: no
 * API means the bundled demo, while an API that refuses us means a login
 * screen. Treating the second as the first would silently show sample
 * data to someone who was simply signed out.
 */
export async function probeSession(): Promise<Session | null> {
  if (STANDALONE) return null
  try {
    const res = await fetch(`${BASE}/auth/me`, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = await res.json()
    return (body && typeof body === 'object' && 'setupNeeded' in body) ? body as Session : null
  } catch {
    return null
  }
}

export async function loadPortfolio(): Promise<{ portfolio: Portfolio; source: DataSource }> {
  if (STANDALONE) return { portfolio: demoPortfolio(), source: 'demo' }
  try {
    const res = await fetch(`${BASE}/portfolio`, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) throw new ApiError(String(res.status), res.status)
    const body = await res.json()
    if (!isPortfolio(body)) throw new Error('The server returned an unexpected response.')
    return { portfolio: body, source: 'database' }
  } catch {
    /* Deliberately not a fallback. The caller shows the fault; inventing a
       portfolio here would hide a broken deployment behind plausible
       figures, which is the one failure nobody would think to check. */
    return { portfolio: emptyPortfolio(), source: 'unreachable' }
  }
}

/** What went wrong, and what to do about it. */
export interface Diagnosis {
  /** The headline: what failed. */
  detail: string
  /** The next action, when the failure names one. */
  remedy?: string
}

/** Reads whatever came back, JSON or not, without throwing. */
async function readBody(res: Response): Promise<{
  error?: string; schema?: string; missing?: string[]; remedy?: string
  detail?: string; code?: string; text: string
}> {
  const text = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(text) as {
      error?: string; schema?: string; missing?: string[]
      remedy?: string; detail?: string; code?: string
    }
    return { ...parsed, text }
  } catch {
    /* Not JSON: a platform error page rather than ours. The first line is
       usually the only useful part, and the rest is markup. */
    return { text: text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) }
  }
}

/**
 * Why the portfolio could not be loaded, for the screen that has to
 * explain it.
 *
 * Two probes, because the interesting failures show up in different
 * places. /api/health answers even when the schema is missing, which
 * separates "no server" from "a server pointed at the wrong database";
 * and a database that is merely *behind* passes health and fails on the
 * first query naming a column it does not have yet.
 */
export async function diagnose(): Promise<Diagnosis> {
  let health: Response
  try {
    health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  } catch {
    return {
      detail: 'Nothing answered at /api.',
      remedy: 'The API is not running, or the deployment has no serverless function. On Vercel, check the project\u2019s Functions log.',
    }
  }

  const body = await readBody(health)

  if (!health.ok) {
    if (body.schema === 'behind') {
      return {
        detail: body.error ?? 'This database is behind the code.',
        remedy: 'Paste docs/upgrade.sql into the database\u2019s SQL editor and run it. Your records are left alone.',
      }
    }
    /* The server classifies the fault and says what to do; repeating that
       judgement here would only let the two drift apart. */
    if (body.error && body.remedy) {
      return {
        detail: body.detail ? `${body.error} (${body.detail})` : body.error,
        remedy: body.remedy,
      }
    }
    return {
      detail: body.error || body.text || `The API answered ${health.status}.`,
      remedy: health.status >= 500 && !body.error
        ? 'That is the platform\u2019s own error page rather than the app\u2019s, so the function crashed or timed out. The Functions log on the host has the stack trace.'
        : undefined,
    }
  }

  /* Health passes, so the server and the database are both there. The
     failure is in a query, and the likeliest reason is a database a
     version or two behind the code. */
  const session = await fetch(`${BASE}/auth/me`, { credentials: 'same-origin' })
    .then(readBody, () => null)
  const reason = session?.error ?? session?.text ?? ''
  if (/does not exist|column|relation/i.test(reason)) {
    return {
      detail: reason.split('\n')[0]!.slice(0, 220),
      remedy: 'The database is behind the code. Run docs/upgrade.sql against it, then reload.',
    }
  }
  if (reason) return { detail: reason.split('\n')[0]!.slice(0, 220) }
  return { detail: 'The API answered, but the portfolio did not load.' }
}

export interface Session {
  member: SessionMember | null
  /** The workspace this session is looking at, and the others available. */
  workspace?: Membership | null
  workspaces?: Membership[]
  /** True only before anybody has a password: the first-run window. */
  setupNeeded: boolean
  /** False for an account that only ever signs in with Google or Apple. */
  hasPassword?: boolean
  identities?: Identity[]
}

/** A Google or Apple account linked to a team member. */
export interface Identity {
  provider: 'google' | 'apple'
  email: string | null
  linkedAt: string
  lastUsedAt: string | null
}

export interface SsoProvider {
  id: 'google' | 'apple'
  label: string
  /** Exactly what has to be registered in the provider's console. */
  redirectUri: string
}

export interface SessionMember {
  /** The membership's identifier — what a property's managerId names. */
  id: string
  name: string
  /** Null while somebody is signed in but belongs to no workspace. */
  role: Role | null
  title: string
  email: string
  phone: string
  since: string
  /** Altier's own support staff. Never true for a customer. */
  isSuperAdmin?: boolean
}

/** What one workspace's subscription is paying for, and how much is spent. */
export interface SeatUsage {
  plan: 'starter' | 'professional' | 'enterprise'
  planLabel: string
  status: 'trialing' | 'active' | 'past_due' | 'cancelled'
  /** Null means unlimited. */
  limit: number | null
  used: number
  remaining: number | null
  pending: number
  tenants: number
  tenantsCountAsSeats: boolean
  open: boolean
}

export interface OpenInvitation {
  id: string
  email: string
  role: Role
  title: string
  status: string
  expiresAt: string
  createdAt: string
}

export interface WorkspaceView {
  organization: { id: string; name: string; slug: string } | null
  seats: SeatUsage
  invitations: OpenInvitation[]
}

/** A workspace this account can open. */
export interface Membership {
  id: string
  organizationId: string
  organizationName: string
  role: Role
  title: string
  status: string
}

export interface PortalLogin {
  clientId: string | null
  memberId: string
  email: string
  hasPassword: boolean
  since: string
}

export const workspace = {
  read: () => send('/workspace') as Promise<WorkspaceView>,
  invite: (input: { email: string; role: Role; title?: string; propertyIds?: string[] }) =>
    send('/workspace/invitations', { method: 'POST', body: JSON.stringify(input) }) as Promise<{
      invitation: { id: string; email: string; role: Role }
      /** Handed over rather than emailed: Altier has no mail server. */
      link: string
      seats: SeatUsage
      invitations: OpenInvitation[]
    }>,
  revoke: (id: string) =>
    send(`/workspace/invitations/${id}`, { method: 'DELETE' }) as Promise<{
      seats: SeatUsage; invitations: OpenInvitation[]
    }>,
  switchTo: (organizationId: string) =>
    send('/auth/workspace', {
      method: 'POST', body: JSON.stringify({ organizationId }),
    }) as Promise<{ member: SessionMember }>,
}

export const portal = {
  list: () => send('/clients/portal') as Promise<{ portal: PortalLogin[] }>,
  grant: (clientId: string, password?: string) =>
    send(`/clients/${clientId}/portal`, {
      method: 'POST', body: JSON.stringify({ password }),
    }) as Promise<{ portal: PortalLogin[] }>,
  revoke: (clientId: string) =>
    send(`/clients/${clientId}/portal`, { method: 'DELETE' }) as Promise<{ portal: PortalLogin[] }>,
}

/** One workspace as Altier's own support desk sees it: counts, not records. */
export interface AdminOrganization {
  id: string
  name: string
  slug: string
  createdAt: string
  plan: string | null
  status: string | null
  seatLimit: number | null
  members: number
  tenants: number
  properties: number
}

export const admin = {
  organizations: () => send('/admin/organizations') as Promise<{ organizations: AdminOrganization[] }>,
}

export const auth = {
  me: () => send('/auth/me') as Promise<Session>,
  providers: () => send('/auth/providers') as Promise<{ providers: SsoProvider[] }>,
  /* A full navigation, not a fetch: the provider answers with its own
     page, and the session cookie has to be set on a top-level request. */
  startSso: (provider: string) => { window.location.assign(`${BASE}/auth/oauth/${provider}/start`) },
  unlink: (provider: string) =>
    send(`/auth/identities/${provider}`, { method: 'DELETE' }) as Promise<{ identities: Identity[] }>,
  /** First run only: creates the owner account on an empty portfolio. */
  setup: (owner: { name: string; email: string; password: string; token?: string }) =>
    send('/auth/setup', { method: 'POST', body: JSON.stringify(owner) }) as Promise<{ member: SessionMember }>,
  login: (email: string, password: string) =>
    send('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<{ member: SessionMember }>,
  logout: () => send('/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) =>
    send('/auth/password', { method: 'PUT', body: JSON.stringify({ current, next }) }),
  /** Reading an invitation before accepting it — open to a stranger. */
  invitation: (token: string) =>
    send(`/auth/invitation/${token}`) as Promise<{
      invitation: { organization: string; email: string; role: Role; title: string; expiresAt: string }
      hasAccount: boolean
    }>,
  join: (token: string, input: { name?: string; password?: string }) =>
    send(`/auth/invitation/${token}`, {
      method: 'POST', body: JSON.stringify(input),
    }) as Promise<{ member: SessionMember }>,
}

export const api = {
  setMemberPassword: (id: string, password: string) =>
    request(`/team/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  /* Creates send the whole record, identifier included, so the row the server
     stores is the row the screen already drew — no flash of a changed id. */
  addProperty: (property: Property) =>
    request('/properties', { method: 'POST', body: JSON.stringify(property) }),
  updateProperty: (property: Property) =>
    request(`/properties/${property.id}`, { method: 'PUT', body: JSON.stringify(property) }),
  addClient: (client: Client) =>
    request('/clients', { method: 'POST', body: JSON.stringify(client) }),
  addBooking: (booking: Booking, invoices: Invoice[]) =>
    request('/bookings', { method: 'POST', body: JSON.stringify({ booking, invoices }) }),
  updateClient: (client: Client) =>
    request(`/clients/${client.id}`, { method: 'PUT', body: JSON.stringify(client) }),
  updateBooking: (booking: Booking) =>
    request(`/bookings/${booking.id}`, { method: 'PUT', body: JSON.stringify(booking) }),
  deleteProperty: (id: string) => request(`/properties/${id}`, { method: 'DELETE' }),
  deleteClient: (id: string) => request(`/clients/${id}`, { method: 'DELETE' }),
  deleteBooking: (id: string) => request(`/bookings/${id}`, { method: 'DELETE' }),
  addMember: (member: TeamMember, password?: string) =>
    request('/team', { method: 'POST', body: JSON.stringify({ ...member, password }) }),
  updateMember: (member: TeamMember) =>
    request(`/team/${member.id}`, { method: 'PUT', body: JSON.stringify(member) }),
  deleteMember: (id: string) => request(`/team/${id}`, { method: 'DELETE' }),
  recordPayment: (invoiceId: string) => request(`/invoices/${invoiceId}/payment`, { method: 'POST' }),
  sendReminder: (invoiceId: string) => request(`/invoices/${invoiceId}/reminder`, { method: 'POST' }),
  setPropertyStatus: (id: string, status: string) =>
    request(`/properties/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  setMaintenanceStatus: (id: string, status: string) =>
    request(`/maintenance/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  addMaintenance: (input: Record<string, unknown>) =>
    request('/maintenance', { method: 'POST', body: JSON.stringify(input) }),
  addNote: (clientId: string, text: string) =>
    request(`/clients/${clientId}/notes`, { method: 'POST', body: JSON.stringify({ text }) }),
  updateReminders: (patch: Record<string, unknown>) =>
    request('/settings/reminders', { method: 'PUT', body: JSON.stringify(patch) }),
  reload: () => request('/portfolio'),
}
