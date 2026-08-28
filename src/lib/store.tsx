import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { TODAY, dayOffset, iso } from './dates.js'
import { buildNotifications } from './notify.js'
import {
  api, auth, emptyPortfolio, isSignedOut, loadPortfolio,
  permissions as permissionsApi, probeSession, workspace,
  type DataSource, type Identity, type Membership, type SessionMember,
} from './api.js'
import { statusForBooking } from './create.js'
import { DEFAULT_PERMISSIONS, setPermissions, type Permission } from './rbac.js'
import { REGIONS, currencyDef, setPresentation } from './money.js'
import { setLanguage, type Language } from './strings.js'
import { takeSsoError } from './sso.js'
import type {
  AppNotification, Booking, Client, Invoice, MaintenanceRequest, MaintenanceStatus,
  Portfolio, Property, PropertyStatus, ReminderSettings, Role, TeamMember,
} from './types.js'

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
  /**
   * Who is signed in, when a server is enforcing it. Null with a live API
   * means the login screen.
   */
  member: SessionMember | null
  /** True only before any account has a password — the first-run window. */
  setupNeeded: boolean
  /** The ways the signed-in account can be opened. */
  hasPassword: boolean
  identities: Identity[]
  /**
   * Which workspace this session is looking at, and the others this
   * account could switch to. Usually one; an agency bookkeeper keeping
   * two landlords' books has two, and they are separate portfolios that
   * happen to share a login.
   */
  workspace: Membership | null
  workspaces: Membership[]
  /** What each role reaches here, as the server last reported it. */
  permissions: Partial<Record<Role, Permission[]>> | null
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
  | { type: 'add-property'; property: Property }
  | { type: 'update-property'; property: Property }
  | { type: 'add-client'; client: Client }
  | { type: 'add-booking'; booking: Booking; invoices: Invoice[] }
  | { type: 'update-client'; client: Client }
  | { type: 'update-booking'; booking: Booking }
  | { type: 'end-booking'; booking: Booking }
  | { type: 'check-in'; id: string; on: string }
  | { type: 'check-out'; id: string; on: string }
  | { type: 'set-permission'; role: Role; permission: Permission; allowed: boolean }
  | { type: 'reset-permissions'; role?: Role }
  | { type: 'delete-property'; id: string }
  | { type: 'delete-client'; id: string }
  | { type: 'delete-booking'; id: string }
  /* The password rides along so the server can create the account and its
     credentials together; the reducer ignores it and it is never stored. */
  | { type: 'add-member'; member: TeamMember; password?: string }
  | { type: 'update-member'; member: TeamMember }
  | { type: 'delete-member'; id: string }
  | { type: 'add-note'; clientId: string; text: string }
  | { type: 'update-reminders'; reminders: Partial<ReminderSettings> }
  | { type: 'set-region'; locale: string }
  | { type: 'set-currency'; currency: string }
  | { type: 'set-language'; language: Language }
  /** Replaces the portfolio with the server's authoritative copy. */
  | { type: 'sync'; portfolio: Portfolio; source?: DataSource }
  | { type: 'signed-in'; member: SessionMember }
  | { type: 'signed-out' }
  | { type: 'setup-needed'; needed: boolean }
  | { type: 'account'; hasPassword: boolean; identities: Identity[] }
  | { type: 'workspaces'; workspace: Membership | null; workspaces: Membership[] }
  | { type: 'reset' }

/** Notifications are derived, never stored, so they are rebuilt on every load. */
const notificationsFor = (p: Portfolio) =>
  buildNotifications(p.properties, p.invoices, p.bookings, p.maintenance, p.clients, p.reminders)

const stateFrom = (p: Portfolio, source: DataSource, hydrated: boolean): State => {
  /* The workspace's own matrix, before anything reads a permission off
     it. can() is called during the render this state feeds, so applying
     it any later would draw one frame against the wrong rules. */
  setPermissions(p.permissions)
  return {
  properties: p.properties,
  clients: p.clients,
  bookings: p.bookings,
  invoices: p.invoices,
  maintenance: p.maintenance,
  notifications: notificationsFor(p),
  reminders: p.reminders,
  team: p.team,
  role: 'owner',
  currentUserId: '',
  locale: 'en-UG',
  currency: 'UGX',
  language: 'en',
  source,
  hydrated,
  member: null,
  setupNeeded: false,
  hasPassword: false,
  identities: [],
  workspace: null,
  workspaces: [],
  permissions: p.permissions ?? null,
  }
}

/* Nothing, until the probe says what there is. An app that starts with
   records already in it has to unlearn them, and for one frame shows
   somebody figures that were never theirs. The single-file build is the
   exception: it has no server to ask, and carries its own portfolio. */
/**
 * Whoever is signed in, as a team record.
 *
 * Always returns somebody. The signed-in account is a row in the team, so
 * the lookup normally succeeds; the fallback covers the frame between
 * signing in and the portfolio arriving, when the session knows who you
 * are and the team list does not yet.
 */
export function currentMember(state: State): TeamMember {
  const found = state.team.find((t) => t.id === state.currentUserId) ?? state.team[0]
  if (found) return found
  return {
    id: state.member?.id ?? '',
    name: state.member?.name ?? 'You',
    role: state.role,
    title: state.member?.title ?? '',
    email: state.member?.email ?? '',
    phone: state.member?.phone ?? '',
    since: state.member?.since ?? '',
  }
}

/* Nothing until the server answers. There is no bundled portfolio to
   start from, so the first frame is empty and the boot gate holds the app
   behind it until the real one arrives. */
const seed = (): State => stateFrom(emptyPortfolio(), 'database', false)

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
    case 'add-property':
      return { ...state, properties: [action.property, ...state.properties] }
    case 'update-property':
      return {
        ...state,
        properties: state.properties.map((p) => (p.id === action.property.id ? action.property : p)),
      }
    case 'add-client':
      return { ...state, clients: [action.client, ...state.clients] }
    case 'update-client':
      return {
        ...state,
        clients: state.clients.map((c) => (c.id === action.client.id ? action.client : c)),
      }
    case 'update-booking':
      return {
        ...state,
        bookings: state.bookings.map((b) => (b.id === action.booking.id ? action.booking : b)),
      }
    /* Ending a tenancy frees the unit. Leaving the property occupied
       against a closed agreement is the bug this exists to prevent. */
    case 'end-booking':
      return {
        ...state,
        bookings: state.bookings.map((b) => (b.id === action.booking.id ? action.booking : b)),
        properties: state.properties.map((p) =>
          p.id === action.booking.propertyId
            ? { ...p, status: 'available' as const, availableFrom: action.booking.end }
            : p),
      }
    /* Arriving holds the unit; leaving frees it from the day they went.
       Applied here as well as on the server so the board moves under the
       press rather than after the round trip. */
    case 'check-in':
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          (b.id === action.id ? { ...b, arrivedOn: action.on, status: 'in_progress' as const } : b)),
        properties: state.properties.map((p) =>
          (p.id === state.bookings.find((b) => b.id === action.id)?.propertyId
            ? { ...p, status: 'occupied' as const, availableFrom: null }
            : p)),
      }
    case 'check-out':
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          (b.id === action.id
            ? { ...b, departedOn: action.on, status: 'completed' as const }
            : b)),
        properties: state.properties.map((p) =>
          (p.id === state.bookings.find((b) => b.id === action.id)?.propertyId
            ? { ...p, status: 'available' as const, availableFrom: action.on }
            : p)),
      }
    /* Applied here as well as on the server, so a tick moves under the
       press rather than after the round trip. The server's answer
       replaces this a moment later either way. */
    case 'set-permission': {
      const current = state.permissions ?? {}
      const list = new Set(current[action.role] ?? DEFAULT_PERMISSIONS[action.role] ?? [])
      if (action.allowed) list.add(action.permission)
      else list.delete(action.permission)
      const next = { ...current, [action.role]: [...list] }
      setPermissions(next)
      return { ...state, permissions: next }
    }
    case 'reset-permissions': {
      const next = action.role
        ? { ...(state.permissions ?? {}), [action.role]: [...(DEFAULT_PERMISSIONS[action.role] ?? [])] }
        : null
      setPermissions(next)
      return { ...state, permissions: next }
    }
    /* Removing a property takes its whole record with it — the database
       cascades, and the screen has to agree or it will look like the
       charges survived. */
    case 'delete-property':
      return {
        ...state,
        properties: state.properties.filter((p) => p.id !== action.id),
        bookings: state.bookings.filter((b) => b.propertyId !== action.id),
        invoices: state.invoices.filter((i) => i.propertyId !== action.id),
        maintenance: state.maintenance.filter((m) => m.propertyId !== action.id),
        clients: state.clients.map((c) => ({
          ...c,
          propertyIds: c.propertyIds.filter((id) => id !== action.id),
        })),
      }
    case 'delete-client':
      return { ...state, clients: state.clients.filter((c) => c.id !== action.id) }
    /* A paid charge is money that moved, so it outlives the agreement,
       unlinked. An unpaid one was only this agreement's expectation and
       goes with it, or a mistake leaves arrears nobody owes. */
    case 'delete-booking':
      return {
        ...state,
        bookings: state.bookings.filter((b) => b.id !== action.id),
        invoices: state.invoices
          .filter((i) => !(i.bookingId === action.id && i.paidAmount === 0))
          .map((i) => (i.bookingId === action.id ? { ...i, bookingId: null } : i)),
      }
    case 'add-member':
      return { ...state, team: [...state.team, action.member] }
    case 'update-member':
      return {
        ...state,
        team: state.team.map((m) => (m.id === action.member.id ? action.member : m)),
        // Changing your own role changes what you can reach.
        role: action.member.id === state.currentUserId ? action.member.role : state.role,
      }
    case 'delete-member':
      return { ...state, team: state.team.filter((m) => m.id !== action.id) }
    /* An agreement is never just a row: it commits the unit, opens the
       client's charges and ties the two together. Splitting that across
       several actions would let the screen show a half-made tenancy. */
    case 'add-booking': {
      const { booking, invoices } = action
      return {
        ...state,
        bookings: [booking, ...state.bookings],
        invoices: [...invoices, ...state.invoices],
        properties: state.properties.map((p) =>
          p.id === booking.propertyId
            ? { ...p, status: statusForBooking(booking), availableFrom: null }
            : p),
        clients: state.clients.map((c) =>
          c.id === booking.clientId
            ? {
                ...c,
                status: 'active' as const,
                propertyIds: c.propertyIds.includes(booking.propertyId)
                  ? c.propertyIds
                  : [...c.propertyIds, booking.propertyId],
              }
            : c),
      }
    }
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
        member: state.member,
        setupNeeded: state.setupNeeded,
        locale: state.locale,
        currency: state.currency,
        language: state.language,
      }
    }
    /* Signing in decides the role: it is the account's, not a preference,
       and the server enforces the same matrix regardless of what is set
       here. The switcher that used to change it is gone. */
    case 'signed-in':
      return {
        ...state,
        member: action.member,
        /* Null while somebody is signed in and belongs to no workspace —
           an account whose membership an owner has just removed. Staff is
           the narrowest role there is, so the interface offers least
           until the server says otherwise, and the server is the one
           refusing anyway. */
        role: action.member.role ?? 'staff',
        currentUserId: action.member.id,
        setupNeeded: false,
      }
    case 'signed-out':
      return {
        ...state, member: null, identities: [], hasPassword: false,
        workspace: null, workspaces: [],
      }
    case 'setup-needed':
      return { ...state, setupNeeded: action.needed }
    /* How this account can be opened: a password, a linked Google or
       Apple account, or both. Settings needs it to know whether removing
       one would leave nobody able to get in. */
    case 'account':
      return { ...state, hasPassword: action.hasPassword, identities: action.identities }
    case 'workspaces':
      return { ...state, workspace: action.workspace, workspaces: action.workspaces }
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
  /** Throws with the server's reason on failure, for the form to show. */
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  switchWorkspace: (organizationId: string) => Promise<void>
  /** First run only: creates the owner account on an empty portfolio. */
  createOwner: (owner: { name: string; email: string; password: string; token?: string }) => Promise<void>
  /** Re-reads which ways in the account has, after linking or unlinking. */
  refreshAccount: () => Promise<void>
  /**
   * Why a Google or Apple sign-in did not work. It arrives as a page load
   * rather than a reply, so it is read once here and held for whichever
   * screen ends up drawn.
   */
  ssoError: string | null
  clearSsoError: () => void
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
      /* storage unavailable — a preference is not worth failing over */
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

  /* Taken from the URL on the first render, before anything can navigate
     and lose it. Read once: a refresh should not re-raise it. */
  const [ssoError, setSsoError] = useState<string | null>(() => takeSsoError())
  const clearSsoError = useCallback(() => setSsoError(null), [])

  /* Boot in two steps, because the answers are different. First: is there
     a server, and does it know us? Only then load the portfolio — asking
     for it while signed out would answer with nothing and look like an
     empty portfolio rather than a login screen. */
  useEffect(() => {
    let cancelled = false
    probeSession().then((session) => {
      if (cancelled) return
      if (session) {
        if (session.member) dispatch({ type: 'signed-in', member: session.member })
        dispatch({ type: 'setup-needed', needed: session.setupNeeded })
        dispatch({
          type: 'account',
          hasPassword: !!session.hasPassword,
          identities: session.identities ?? [],
        })
        dispatch({
          type: 'workspaces',
          workspace: session.workspace ?? null,
          workspaces: session.workspaces ?? [],
        })
        if (!session.member) {
          // Signed out: nothing to load, and the gate will ask for a password.
          dispatch({ type: 'sync', portfolio: emptyPortfolio(), source: 'database' })
          return
        }
      }
      loadPortfolio().then(({ portfolio, source }) => {
        if (!cancelled) dispatch({ type: 'sync', portfolio, source })
      })
    })
    return () => { cancelled = true }
  }, [])

  /* A link attempted from Settings fails back to the app, not to the
     sign-in screen — so somebody already signed in needs to be told in
     the way the rest of the app tells them things. */
  useEffect(() => {
    if (!ssoError || !state.member) return
    toast({ title: 'That account was not linked', body: ssoError, tone: 'critical' })
    setSsoError(null)
  }, [ssoError, state.member, toast])

  /* Signing in and out. Both reload the portfolio, because what a role may
     see differs and the previous answer is not theirs. */
  /* Which ways in this account has. Re-read rather than guessed, because
     linking one happens through a full page navigation and comes back as
     a fresh boot, not as a reply we could have merged. */
  const refreshAccount = useCallback(async () => {
    const session = await auth.me()
    dispatch({
      type: 'account',
      hasPassword: !!session.hasPassword,
      identities: session.identities ?? [],
    })
    dispatch({
      type: 'workspaces',
      workspace: session.workspace ?? null,
      workspaces: session.workspaces ?? [],
    })
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { member } = await auth.login(email, password)
    dispatch({ type: 'signed-in', member })
    const { portfolio } = await loadPortfolio()
    dispatch({ type: 'sync', portfolio, source: 'database' })
    await refreshAccount().catch(() => { /* cosmetic; the session is real */ })
  }, [refreshAccount])

  const createOwner = useCallback(async (owner: { name: string; email: string; password: string; token?: string }) => {
    const { member } = await auth.setup(owner)
    dispatch({ type: 'signed-in', member })
    const { portfolio } = await loadPortfolio()
    dispatch({ type: 'sync', portfolio, source: 'database' })
    await refreshAccount().catch(() => { /* cosmetic; the session is real */ })
  }, [refreshAccount])

  /**
   * Moving to another workspace this account belongs to.
   *
   * A whole reload rather than a re-render: the session now names a
   * different organization, and every figure the app is holding belongs
   * to the last one. Merging the two would show one workspace's numbers
   * under the other's name for as long as it took to notice.
   */
  const switchWorkspace = useCallback(async (organizationId: string) => {
    try {
      const { member } = await workspace.switchTo(organizationId)
      dispatch({ type: 'signed-in', member })
      const { portfolio } = await loadPortfolio()
      dispatch({ type: 'sync', portfolio, source: 'database' })
      await refreshAccount().catch(() => { /* cosmetic; the session is real */ })
    } catch (error) {
      toast({ title: 'Could not switch', body: (error as Error).message, tone: 'critical' })
    }
  }, [refreshAccount, toast])

  const signOut = useCallback(async () => {
    await auth.logout().catch(() => { /* the cookie is going either way */ })
    dispatch({ type: 'signed-out' })
    // Whoever signs in next must not inherit a frame of the last person's data.
    dispatch({ type: 'sync', portfolio: emptyPortfolio(), source: 'database' })
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
      case 'add-property': return () => api.addProperty(action.property)
      case 'update-client': return () => api.updateClient(action.client)
      case 'update-booking': return () => api.updateBooking(action.booking)
      case 'end-booking': return () => api.updateBooking(action.booking)
      case 'check-in': return () => api.checkIn(action.id, action.on)
      case 'check-out': return () => api.checkOut(action.id, action.on)
      case 'set-permission':
        return () => permissionsApi.set(action.role, action.permission, action.allowed)
      case 'reset-permissions': return () => permissionsApi.reset(action.role)
      case 'delete-property': return () => api.deleteProperty(action.id)
      case 'delete-client': return () => api.deleteClient(action.id)
      case 'delete-booking': return () => api.deleteBooking(action.id)
      case 'add-member': return () => api.addMember(action.member, action.password)
      case 'update-member': return () => api.updateMember(action.member)
      case 'delete-member': return () => api.deleteMember(action.id)
      case 'update-property': return () => api.updateProperty(action.property)
      case 'add-client': return () => api.addClient(action.client)
      case 'add-booking': return () => api.addBooking(action.booking, action.invoices)
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
       than restoring anything local, so the reducer is skipped. */
    if (!(live && action.type === 'reset')) dispatch(action)
    if (!live) return
    const call = requestFor(action)
    if (!call) return
    call().then(
      (portfolio) => dispatch({ type: 'sync', portfolio }),
      (error: Error) => {
        /* A session that ended mid-edit is not a failed save to apologise
           for; it is a sign-in to ask for. Anything else is worth saying. */
        if (isSignedOut(error)) {
          dispatch({ type: 'signed-out' })
          return
        }
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
      signIn,
      signOut,
      switchWorkspace,
      createOwner,
      refreshAccount,
      ssoError,
      clearSsoError,
    }),
    [state, theme, toasts, toast, dismissToast, paletteOpen, dispatchWithSync, signIn, signOut,
     switchWorkspace, createOwner, refreshAccount, ssoError, clearSsoError],
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
