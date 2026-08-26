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
import type { Portfolio } from './types'

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

async function request(path: string, init?: RequestInit): Promise<Portfolio> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Request failed (${res.status})`)
  }
  if (!isPortfolio(body)) throw new Error('The server returned an unexpected response.')
  return body
}

/** Loads the portfolio, falling back to the bundled demo data. */
export async function loadPortfolio(): Promise<{ portfolio: Portfolio; source: DataSource }> {
  if (STANDALONE) return { portfolio: demoPortfolio(), source: 'demo' }
  try {
    const res = await fetch(`${BASE}/portfolio`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (!res.ok) throw new Error(String(res.status))
    const body = await res.json()
    if (!isPortfolio(body)) throw new Error('not a portfolio')
    return { portfolio: body, source: 'database' }
  } catch {
    return { portfolio: demoPortfolio(), source: 'demo' }
  }
}

export const api = {
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
