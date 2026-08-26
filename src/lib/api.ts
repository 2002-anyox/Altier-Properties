/* ------------------------------------------------------------------ *
 * API client
 *
 * The app runs in two modes and is honest about which:
 *
 *   database — an API is reachable, so the portfolio is loaded from it and
 *              every change is written back
 *   demo     — no API, so the bundled generator supplies the portfolio and
 *              changes live only in the tab
 *
 * The published single-file build is always a demo and never probes.
 * ------------------------------------------------------------------ */

import {
  BOOKINGS, CLIENTS, DEFAULT_REMINDERS, INVOICES, MAINTENANCE, PROPERTIES, TEAM,
} from './data'
import type { Booking, Client, Invoice, Portfolio, Property, Role, TeamMember } from './types'

export type DataSource = 'database' | 'demo'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const STANDALONE = import.meta.env.MODE === 'single'
const PROBE_TIMEOUT_MS = 4000

export const demoPortfolio = (): Portfolio => ({
  properties: PROPERTIES,
  clients: CLIENTS,
  bookings: BOOKINGS,
  invoices: INVOICES,
  maintenance: MAINTENANCE,
  team: TEAM,
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
  constructor(message: string, readonly status: number) { super(message) }
}

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
    throw new ApiError(
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`,
      res.status,
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
    if (!isPortfolio(body)) throw new Error('not a portfolio')
    return { portfolio: body, source: 'database' }
  } catch {
    return { portfolio: demoPortfolio(), source: 'demo' }
  }
}

export interface Session {
  member: SessionMember | null
  /** True only before anybody has a password: the first-run window. */
  setupNeeded: boolean
}

export interface SessionMember {
  id: string
  name: string
  role: Role
  title: string
  email: string
  phone: string
  since: string
}

export const auth = {
  me: () => send('/auth/me') as Promise<Session>,
  claimable: () => send('/auth/claimable') as Promise<{ members: Array<{ id: string; name: string; role: Role; title: string }> }>,
  setup: (memberId: string, password: string, token?: string) =>
    send('/auth/setup', { method: 'POST', body: JSON.stringify({ memberId, password, token }) }) as Promise<{ member: SessionMember }>,
  login: (email: string, password: string) =>
    send('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }) as Promise<{ member: SessionMember }>,
  logout: () => send('/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) =>
    send('/auth/password', { method: 'PUT', body: JSON.stringify({ current, next }) }),
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
