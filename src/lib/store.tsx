import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  BOOKINGS, CLIENTS, DEFAULT_REMINDERS, INVOICES, MAINTENANCE, PROPERTIES, TEAM, TODAY,
  buildNotifications, dayOffset, iso,
} from './data'
import { api, demoPortfolio, loadPortfolio, type DataSource } from './api'
import { REGIONS, currencyDef, setPresentation } from './money'
import { setLanguage, type Language } from './strings'
import type {
  AppNotification, Booking, Client, Invoice, MaintenanceRequest, MaintenanceStatus,
  Portfolio, Property, PropertyStatus, ReminderSettings, Role, TeamMember,
} from './types'

type Theme = 'light' | 'dark'

interface State {
  properties: Property[]
  clients: Client[]
  bookings: Booking[]
  invoices: Invoice[]
  maintenance: MaintenanceRequest[]
  notifications: AppNotification[]
  reminders: ReminderSettings
  team: TeamMember[]
  role: Role
  currentUserId: string
  /** How figures and dates are presented. Amounts stay in EUR underneath. */
  locale: string
  currency: string
  language: Language
  /** Where the portfolio came from, and whether it has arrived yet. */
  source: DataSource
  hydrated: boolean
}

type Action =
  | { type: 'set-role'; role: Role }
  | { type: 'mark-read'; id: string }
  | { type: 'mark-unread'; id: string }
  | { type: 'mark-all-read' }
  | { type: 'clear-read' }
  | { type: 'record-payment'; invoiceId: string }
  | { type: 'send-reminder'; invoiceId: string }
  | { type: 'set-property-status'; id: string; status: PropertyStatus }
  | { type: 'set-maintenance-status'; id: string; status: MaintenanceStatus }
  | { type: 'add-maintenance'; request: MaintenanceRequest }
  | { type: 'add-note'; clientId: string; text: string }
  | { type: 'update-reminders'; reminders: Partial<ReminderSettings> }
  | { type: 'set-region'; locale: string }
  | { type: 'set-currency'; currency: string }
  | { type: 'set-language'; language: Language }
  /** Replaces the portfolio with the server's authoritative copy. */
  | { type: 'sync'; portfolio: Portfolio; source?: DataSource }
  | { type: 'reset' }

/** Notifications are derived, never stored, so they are rebuilt on every load. */
const notificationsFor = (p: Portfolio) =>
  buildNotifications(p.properties, p.invoices, p.bookings, p.maintenance, p.clients, p.reminders)

const stateFrom = (p: Portfolio, source: DataSource, hydrated: boolean): State => ({
  properties: p.properties,
  clients: p.clients,
  bookings: p.bookings,
  invoices: p.invoices,
  maintenance: p.maintenance,
  notifications: notificationsFor(p),
  reminders: p.reminders,
  team: p.team,
  role: 'owner',
  currentUserId: 'tm-01',
  locale: 'en-UG',
  currency: 'UGX',
  language: 'en',
  source,
  hydrated,
})

const seed = (): State => stateFrom(demoPortfolio(), 'demo', false)

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set-role': {
      const member = state.team.find((t) => t.role === action.role)
      return { ...state, role: action.role, currentUserId: member?.id ?? state.currentUserId }
    }
    case 'mark-read':
      return { ...state, notifications: state.notifications.map((n) => (n.id === action.id ? { ...n, read: true } : n)) }
    case 'mark-unread':
      return { ...state, notifications: state.notifications.map((n) => (n.id === action.id ? { ...n, read: false } : n)) }
    case 'mark-all-read':
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) }
    case 'clear-read':
      return { ...state, notifications: state.notifications.filter((n) => !n.read) }
    case 'record-payment': {
      const invoices = state.invoices.map((i) =>
        i.id === action.invoiceId
          ? { ...i, status: 'paid' as const, paidAmount: i.amount, paidOn: iso(TODAY), method: i.method ?? ('bank_transfer' as const) }
          : i,
      )
      return {
        ...state,
        invoices,
        notifications: state.notifications.filter((n) => n.entity?.type !== 'invoice' || n.entity.id !== action.invoiceId),
      }
    }
    case 'send-reminder': {
      const inv = state.invoices.find((i) => i.id === action.invoiceId)
      if (!inv) return state
      const client = state.clients.find((c) => c.id === inv.clientId)
      if (!client) return state
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === client.id
            ? {
                ...c,
                communications: [
                  {
                    id: `${c.id}-cm-${Date.now()}`,
                    channel: 'email' as const,
                    direction: 'outbound' as const,
                    subject: `Payment reminder — ${inv.number}`,
                    preview: `A polite reminder that ${inv.memo} is due on ${inv.dueOn}.`,
                    at: iso(TODAY),
                    author: 'Altier Properties',
                  },
                  ...c.communications,
                ],
              }
            : c,
        ),
      }
    }
    case 'set-property-status':
      return {
        ...state,
        properties: state.properties.map((p) =>
          p.id === action.id
            ? { ...p, status: action.status, availableFrom: action.status === 'available' ? iso(TODAY) : p.availableFrom }
            : p,
        ),
      }
    case 'set-maintenance-status':
      return {
        ...state,
        maintenance: state.maintenance.map((m) =>
          m.id === action.id
            ? {
                ...m,
                status: action.status,
                completedOn: action.status === 'completed' ? iso(TODAY) : null,
                actualCost: action.status === 'completed' ? (m.actualCost ?? m.estimatedCost) : m.actualCost,
                timeline: [...m.timeline, { at: iso(TODAY), label: `Status changed to ${action.status.replace(/_/g, ' ')}`, by: 'You' }],
              }
            : m,
        ),
      }
    case 'add-maintenance':
      return { ...state, maintenance: [action.request, ...state.maintenance] }
    case 'add-note':
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === action.clientId
            ? {
                ...c,
                communications: [
                  {
                    id: `${c.id}-cm-${Date.now()}`,
                    channel: 'note' as const,
                    direction: 'outbound' as const,
                    subject: 'Internal note',
                    preview: action.text,
                    at: iso(TODAY),
                    author: 'You',
                  },
                  ...c.communications,
                ],
              }
            : c,
        ),
      }
    case 'update-reminders': {
      const reminders = { ...state.reminders, ...action.reminders }
      const fresh = buildNotifications(state.properties, state.invoices, state.bookings, state.maintenance, state.clients, reminders)
      const readIds = new Set(state.notifications.filter((n) => n.read).map((n) => n.id))
      return { ...state, reminders, notifications: fresh.map((n) => (readIds.has(n.id) ? { ...n, read: true } : n)) }
    }
    /* Choosing a region moves the currency with it — nobody wants Uganda
       priced in euros — but an explicit currency choice afterwards sticks. */
    case 'set-region': {
      const region = REGIONS.find((r) => r.locale === action.locale)
      return { ...state, locale: action.locale, currency: region?.currency ?? state.currency }
    }
    case 'set-currency':
      return { ...state, currency: currencyDef(action.currency).code }
    case 'set-language':
      return { ...state, language: action.language }
    case 'sync': {
      const fresh = stateFrom(action.portfolio, action.source ?? state.source, true)
      // Read state lives only in this tab; a refresh must not mark everything unread.
      const read = new Set(state.notifications.filter((n) => n.read).map((n) => n.id))
      return {
        ...fresh,
        notifications: fresh.notifications.map((n) => (read.has(n.id) ? { ...n, read: true } : n)),
        // Preferences belong to the person, not the portfolio.
        role: state.role,
        currentUserId: state.currentUserId,
        locale: state.locale,
        currency: state.currency,
        language: state.language,
      }
    }
    case 'reset':
      return { ...seed(), hydrated: true, role: state.role, currentUserId: state.currentUserId,
               locale: state.locale, currency: state.currency, language: state.language }
    default:
      return state
  }
}

export interface Toast {
  id: number
  title: string
  body?: string
  tone?: 'default' | 'success' | 'warning' | 'critical'
}

interface Ctx {
  state: State
  dispatch: React.Dispatch<Action>
  theme: Theme
  toggleTheme: () => void
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
}

const StoreContext = createContext<Ctx | null>(null)

const THEME_KEY = 'altier.theme'
const PREFS_KEY = 'altier.prefs'

function readStoredTheme(): Theme {
  /* Precedence: what this viewer last chose, then a theme the host document
     has already stamped on <html>, then the operating system. */
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* storage unavailable — fall through */
  }
  const stamped = document.documentElement.getAttribute('data-theme')
  if (stamped === 'light' || stamped === 'dark') return stamped
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const base = seed()
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as {
          role?: Role; reminders?: ReminderSettings
          locale?: string; currency?: string; language?: Language
        }
        if (parsed.role) {
          const member = base.team.find((t) => t.role === parsed.role)
          base.role = parsed.role
          if (member) base.currentUserId = member.id
        }
        if (parsed.reminders) {
          base.reminders = { ...base.reminders, ...parsed.reminders }
          base.notifications = buildNotifications(base.properties, base.invoices, base.bookings, base.maintenance, base.clients, base.reminders)
        }
        if (parsed.locale) base.locale = parsed.locale
        if (parsed.currency) base.currency = parsed.currency
        if (parsed.language) base.language = parsed.language
      }
    } catch {
      /* storage unavailable — the demo still runs */
    }
    return base
  })

  const stateRef = useRef(state)
  stateRef.current = state

  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0A0F17' : '#F3EFE7')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch { /* ignore */ }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        role: state.role,
        reminders: state.reminders,
        locale: state.locale,
        currency: state.currency,
        language: state.language,
      }))
    } catch { /* ignore */ }
  }, [state.role, state.reminders, state.locale, state.currency, state.language])

  /* Applied during render, not in an effect: the format helpers are read
     synchronously by children, so an effect would leave one stale frame. */
  setPresentation(state.locale, state.currency)
  setLanguage(state.language)

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { tone: 'default', ...t, id }])
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200)
  }, [])

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), [])

  /* Load the portfolio once. Without an API this resolves to the bundled
     demo data, so the published build works with no server at all. */
  useEffect(() => {
    let cancelled = false
    loadPortfolio().then(({ portfolio, source }) => {
      if (!cancelled) dispatch({ type: 'sync', portfolio, source })
    })
    return () => { cancelled = true }
  }, [])

  /* Which actions have to reach the server, and how. Anything absent here
     is a preference or a view concern and stays in the tab. */
  const requestFor = useCallback((action: Action): (() => Promise<Portfolio>) | null => {
    switch (action.type) {
      case 'record-payment': return () => api.recordPayment(action.invoiceId)
      case 'send-reminder': return () => api.sendReminder(action.invoiceId)
      case 'set-property-status': return () => api.setPropertyStatus(action.id, action.status)
      case 'set-maintenance-status': return () => api.setMaintenanceStatus(action.id, action.status)
      case 'add-note': return () => api.addNote(action.clientId, action.text)
      case 'update-reminders': return () => api.updateReminders(action.reminders as Record<string, unknown>)
      case 'add-maintenance': {
        const r = action.request
        return () => api.addMaintenance({
          propertyId: r.propertyId, title: r.title, description: r.description,
          priority: r.priority, vendor: r.vendor, dueOn: r.dueOn,
        })
      }
      // Re-reading is the only sensible "reset" once a database is behind it.
      case 'reset': return () => api.reload()
      default: return null
    }
  }, [])

  /* Applies every action locally first so the interface stays instant, then
     writes it through and adopts the server's copy. On failure the server is
     re-read rather than guessed at, so a rejected write cannot leave the
     screen showing something that never happened. */
  const dispatchWithSync = useCallback<React.Dispatch<Action>>((action) => {
    const live = stateRef.current.source === 'database'
    /* With a database behind it, "reset" means re-reading the server rather
       than restoring the bundled demo, so the local reducer is skipped. */
    if (!(live && action.type === 'reset')) dispatch(action)
    if (!live) return
    const call = requestFor(action)
    if (!call) return
    call().then(
      (portfolio) => dispatch({ type: 'sync', portfolio }),
      (error: Error) => {
        toast({ title: 'Change not saved', body: error.message, tone: 'critical' })
        api.reload().then(
          (portfolio) => dispatch({ type: 'sync', portfolio }),
          () => { /* the server is unreachable; the optimistic state stands */ },
        )
      },
    )
  }, [requestFor, toast])

  const value = useMemo<Ctx>(
    () => ({
      state,
      dispatch: dispatchWithSync,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      toasts,
      toast,
      dismissToast,
      paletteOpen,
      setPaletteOpen,
    }),
    [state, theme, toasts, toast, dismissToast, paletteOpen, dispatchWithSync],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/* ------------------------- convenience hooks ------------------------ */
export function useLookups() {
  const { state } = useStore()
  return useMemo(
    () => ({
      propertyById: (id: string) => state.properties.find((p) => p.id === id),
      clientById: (id: string) => state.clients.find((c) => c.id === id),
      bookingById: (id: string) => state.bookings.find((b) => b.id === id),
      invoiceById: (id: string) => state.invoices.find((i) => i.id === id),
      maintenanceById: (id: string) => state.maintenance.find((m) => m.id === id),
      memberById: (id: string) => state.team.find((t) => t.id === id),
    }),
    [state],
  )
}

export const TODAY_ISO = iso(TODAY)
export { dayOffset }
