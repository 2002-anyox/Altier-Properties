import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import {
  BOOKINGS, CLIENTS, DEFAULT_REMINDERS, INVOICES, MAINTENANCE, PROPERTIES, TEAM, TODAY,
  buildNotifications, dayOffset, iso,
} from './data'
import type {
  AppNotification, Booking, Client, Invoice, MaintenanceRequest, MaintenanceStatus,
  Property, PropertyStatus, ReminderSettings, Role, TeamMember,
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
  | { type: 'reset' }

const seed = (): State => ({
  properties: PROPERTIES,
  clients: CLIENTS,
  bookings: BOOKINGS,
  invoices: INVOICES,
  maintenance: MAINTENANCE,
  notifications: buildNotifications(PROPERTIES, INVOICES, BOOKINGS, MAINTENANCE, CLIENTS, DEFAULT_REMINDERS),
  reminders: DEFAULT_REMINDERS,
  team: TEAM,
  role: 'owner',
  currentUserId: 'tm-01',
})

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
    case 'reset':
      return seed()
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
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark') return v
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
        const parsed = JSON.parse(raw) as { role?: Role; reminders?: ReminderSettings }
        if (parsed.role) {
          const member = base.team.find((t) => t.role === parsed.role)
          base.role = parsed.role
          if (member) base.currentUserId = member.id
        }
        if (parsed.reminders) {
          base.reminders = { ...base.reminders, ...parsed.reminders }
          base.notifications = buildNotifications(base.properties, base.invoices, base.bookings, base.maintenance, base.clients, base.reminders)
        }
      }
    } catch {
      /* storage unavailable — the demo still runs */
    }
    return base
  })

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
      localStorage.setItem(PREFS_KEY, JSON.stringify({ role: state.role, reminders: state.reminders }))
    } catch { /* ignore */ }
  }, [state.role, state.reminders])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { tone: 'default', ...t, id }])
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200)
  }, [])

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), [])

  const value = useMemo<Ctx>(
    () => ({
      state,
      dispatch,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      toasts,
      toast,
      dismissToast,
      paletteOpen,
      setPaletteOpen,
    }),
    [state, theme, toasts, toast, dismissToast, paletteOpen],
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
