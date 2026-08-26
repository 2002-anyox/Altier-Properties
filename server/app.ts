/* ------------------------------------------------------------------ *
 * HTTP API
 *
 * One bootstrap endpoint returns the whole portfolio — at this size the
 * dataset is kilobytes, so the client holds it and every selector keeps
 * working over plain arrays. Each mutation returns the refreshed
 * portfolio, so the client and the database cannot drift.
 *
 * The app is built by a factory rather than at module scope so it can be
 * mounted two ways: a long-running process locally (server/serve.ts,
 * `npm run api`) and a serverless function in production (api/index.ts).
 * ------------------------------------------------------------------ */

import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { eq, sql } from 'drizzle-orm'
import { connect, type Db } from './db/client.ts'
import { properties, teamMembers } from './db/schema.ts'
import { readPortfolio } from './db/read.ts'
import {
  Conflict, NotFound, addBooking, addClient, addMaintenance, addMember, addNote,
  addProperty, deleteBooking, deleteClient, deleteMember, deleteProperty,
  recordPayment, sendReminder, setMaintenanceStatus, setPropertyStatus,
  updateBooking, updateClient, updateMember, updateProperty, updateReminders,
} from './mutations.ts'
import type { Booking, Client, Invoice, Property, TeamMember } from '../src/lib/types.ts'
import { can } from '../src/lib/rbac.ts'
import {
  Forbidden, MIN_PASSWORD, SESSION_COOKIE, Unauthorized, attachMember, claimableMembers,
  clearFailures, clearSessionCookie, createSession, destroyAllSessions, destroySession,
  equaliseTiming, findByEmail, hashPassword, lockedFor, noAccountsYet, recordFailure, rejectPassword,
  requireMember, requirePermission, setPassword, setSessionCookie, verifyPassword,
  type Authed,
} from './auth.ts'

/** What the client is allowed to know about an account. Never the hash. */
const publicMember = (m: { id: string; name: string; role: string; title: string; email: string; phone: string; since: string }) =>
  ({ id: m.id, name: m.name, role: m.role, title: m.title, email: m.email, phone: m.phone, since: m.since })

export function createApp(db: Db, driver: string) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '256kb' }))

  app.use(cookieParser())

  /* Routes are registered under /api because that is what the browser asks
     for. A serverless platform may strip the prefix before handing the
     request over, so put it back rather than depend on which one does. */
  app.use((req, _res, next) => {
    if (!req.url.startsWith('/api/') && req.url !== '/api') req.url = `/api${req.url}`
    next()
  })

  /** Wraps a handler so a rejected promise reaches the error middleware. */
  const route = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next) }

  /** Express types a route param as string | string[]; ours are always single. */
  const param = (req: Request, name: string) => String((req.params as Record<string, string>)[name])

  // Who is asking, on every request. Requiring anybody is per route.
  app.use(attachMember(db))

  /**
   * Every mutation answers with the authoritative portfolio — filtered to
   * what the asker may see, so a role that cannot view payments does not
   * receive them and then merely have them hidden.
   */
  const withPortfolio = (res: Response, req: Authed) =>
    readPortfolio(db).then((portfolio) => res.json(visibleTo(portfolio, req)))

  const visibleTo = (portfolio: Awaited<ReturnType<typeof readPortfolio>>, req: Authed) => {
    const role = req.member?.role
    if (role && !can(role, 'view:payments')) return { ...portfolio, invoices: [] }
    return portfolio
  }

  /* Reports whether the schema is actually there, not just whether the
     process is up: a deployment pointed at an unmigrated database is the
     failure most worth being able to see from outside. */
  app.get('/api/health', route(async (_req, res) => {
    try {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(properties)
      res.json({ ok: true, driver, schema: 'ready', properties: count })
    } catch (error) {
      res.status(503).json({
        ok: false,
        driver,
        schema: 'missing',
        error: 'The database has no schema yet — run `npm run db:migrate` and `npm run db:seed` against it.',
        detail: (error as Error).message,
      })
    }
  }))

  /* ---------------------------- signing in --------------------------- *
   * Health and the auth routes are the only ones a stranger may reach.
   * Everything below them requires a session and the right role.
   * ------------------------------------------------------------------- */

  /** Who am I, and is anyone able to sign in at all yet. */
  app.get('/api/auth/me', route(async (req: Authed, res) => {
    const member = req.member
    res.json({
      member: member ? publicMember(member) : null,
      // Only meaningful before the first password exists; false forever after.
      setupNeeded: member ? false : await noAccountsYet(db),
    })
  }))

  /** The accounts a first-run claim may pick from. Closed once one exists. */
  app.get('/api/auth/claimable', route(async (_req, res) => {
    if (!await noAccountsYet(db)) throw new Forbidden('This portfolio is already set up.')
    res.json({ members: await claimableMembers(db) })
  }))

  /**
   * First run only. Claims one of the seeded team members by giving it a
   * password. The window closes the instant any account has one, so this
   * cannot be used to mint a second way in later.
   */
  app.post('/api/auth/setup', route(async (req, res) => {
    if (!await noAccountsYet(db)) throw new Forbidden('This portfolio is already set up.')

    /* An operator who wants the window closed even before first use can set
       SETUP_TOKEN; without it the only protection is doing this promptly. */
    const expected = process.env.SETUP_TOKEN
    if (expected && String(req.body?.token ?? '') !== expected) {
      throw new Forbidden('That setup token is not right.')
    }

    const memberId = String(req.body?.memberId ?? '')
    const password = String(req.body?.password ?? '')
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, memberId))
    if (!member) throw new BadRequest('Choose which account to claim.')
    if (member.passwordHash) throw new Forbidden('That account already has a password.')

    const problem = rejectPassword(password, member)
    if (problem) throw new BadRequest(problem)

    await setPassword(db, member.id, password)
    const { token, expiresAt } = await createSession(db, member.id, req.get('user-agent'))
    setSessionCookie(res, token, expiresAt)
    res.json({ member: publicMember(member) })
  }))

  app.post('/api/auth/login', route(async (req, res) => {
    const email = String(req.body?.email ?? '')
    const password = String(req.body?.password ?? '')
    const member = await findByEmail(db, email)

    /* One message for every failure. Saying "no such account" tells an
       attacker which addresses are worth attacking. */
    const refuse = () => { throw new Unauthorized('That email and password do not match an account.') }

    if (!member || !member.passwordHash) {
      // Spend comparable time either way so absence is not timeable.
      await equaliseTiming(password)
      refuse()
      return
    }
    const minutes = lockedFor(member)
    if (minutes > 0) {
      throw new Unauthorized(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
    }
    if (!await verifyPassword(password, member.passwordHash)) {
      await recordFailure(db, member.id, member.failedAttempts)
      refuse()
      return
    }

    await clearFailures(db, member.id)
    const { token, expiresAt } = await createSession(db, member.id, req.get('user-agent'))
    setSessionCookie(res, token, expiresAt)
    res.json({ member: publicMember(member) })
  }))

  app.post('/api/auth/logout', route(async (req, res) => {
    await destroySession(db, req.cookies?.[SESSION_COOKIE] as string | undefined)
    clearSessionCookie(res)
    res.json({ ok: true })
  }))

  /** Changing your own password. Requires the current one, and signs out
   *  every other session — a change is usually a response to a worry. */
  app.put('/api/auth/password', route(async (req: Authed, res) => {
    const member = requireMember(req)
    const current = String(req.body?.current ?? '')
    const next = String(req.body?.next ?? '')
    if (!await verifyPassword(current, member.passwordHash)) {
      throw new Unauthorized('That is not your current password.')
    }
    const problem = rejectPassword(next, member)
    if (problem) throw new BadRequest(problem)

    await setPassword(db, member.id, next)
    await destroyAllSessions(db, member.id)
    const { token, expiresAt } = await createSession(db, member.id, req.get('user-agent'))
    setSessionCookie(res, token, expiresAt)
    res.json({ ok: true })
  }))

  /** An owner giving somebody a password, or replacing a forgotten one. */
  app.put('/api/team/:id/password', requirePermission('manage:team'), route(async (req, res) => {
    const id = param(req, 'id')
    const password = String(req.body?.password ?? '')
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id))
    if (!member) throw new NotFound(`team member ${id} not found`)
    const problem = rejectPassword(password, member)
    if (problem) throw new BadRequest(problem)

    await setPassword(db, id, password)
    // Whatever they were doing with the old one, they are not any more.
    await destroyAllSessions(db, id)
    return withPortfolio(res, req)
  }))

  app.get('/api/portfolio', requirePermission('view:dashboard'), route(async (req, res) => withPortfolio(res, req)))

  app.post('/api/invoices/:id/payment', requirePermission('edit:payments'), route(async (req, res) => {
    await recordPayment(db, param(req, 'id'))
    return withPortfolio(res, req)
  }))

  app.post('/api/invoices/:id/reminder', requirePermission('edit:payments'), route(async (req, res) => {
    await sendReminder(db, param(req, 'id'))
    return withPortfolio(res, req)
  }))

  app.patch('/api/properties/:id/status', requirePermission('edit:properties'), route(async (req, res) => {
    await setPropertyStatus(db, param(req, 'id'), req.body?.status)
    return withPortfolio(res, req)
  }))

  app.patch('/api/maintenance/:id/status', requirePermission('edit:maintenance'), route(async (req, res) => {
    await setMaintenanceStatus(db, param(req, 'id'), req.body?.status)
    return withPortfolio(res, req)
  }))

  app.post('/api/maintenance', requirePermission('edit:maintenance'), route(async (req, res) => {
    await addMaintenance(db, req.body)
    return withPortfolio(res, req)
  }))

  app.post('/api/clients/:id/notes', requirePermission('edit:clients'), route(async (req, res) => {
    const text = String(req.body?.text ?? '').trim()
    if (!text) return res.status(400).json({ error: 'A note cannot be empty.' })
    await addNote(db, param(req, 'id'), text)
    return withPortfolio(res, req)
  }))

  /* ------------------------- creating records ------------------------ *
   * The client sends a record the factories in src/lib/create.ts already
   * completed. These routes check the shape they depend on so a malformed
   * payload is a 400 here rather than a constraint violation deeper down,
   * and leave the domain rules themselves to the schema.
   * ------------------------------------------------------------------- */

  class BadRequest extends Error {}

  /** Throws unless `value` is an object carrying every named string field. */
  function requireShape(value: unknown, fields: string[], what: string) {
    const record = value as Record<string, unknown> | null
    if (!record || typeof record !== 'object') throw new BadRequest(`A ${what} is required.`)
    for (const field of fields) {
      const v = record[field]
      if (typeof v !== 'string' || !v.trim()) {
        throw new BadRequest(`A ${what} needs ${field}.`)
      }
    }
    return record
  }

  app.post('/api/properties', requirePermission('edit:properties'), route(async (req, res) => {
    const body = req.body as Property
    requireShape(body, ['id', 'code', 'name', 'type', 'mode', 'status', 'managerId'], 'property')
    if (!body.address?.line1) throw new BadRequest('A property needs an address.')
    await addProperty(db, body)
    return withPortfolio(res, req)
  }))

  app.put('/api/properties/:id', requirePermission('edit:properties'), route(async (req, res) => {
    const body = req.body as Property
    requireShape(body, ['name', 'type', 'mode', 'status', 'managerId'], 'property')
    if (!body.address?.line1) throw new BadRequest('A property needs an address.')
    await updateProperty(db, param(req, 'id'), body)
    return withPortfolio(res, req)
  }))

  app.post('/api/clients', requirePermission('edit:clients'), route(async (req, res) => {
    const body = req.body as Client
    requireShape(body, ['id', 'name', 'kind', 'status'], 'client')
    await addClient(db, body)
    return withPortfolio(res, req)
  }))

  app.post('/api/bookings', requirePermission('edit:bookings'), route(async (req, res) => {
    const { booking, invoices } = (req.body ?? {}) as { booking: Booking; invoices: Invoice[] }
    requireShape(booking, ['id', 'reference', 'propertyId', 'clientId', 'mode', 'status', 'start'], 'agreement')
    if (booking.mode !== 'rental' && !booking.end) {
      throw new BadRequest('Only a rental may be open-ended; give the agreement an end date.')
    }
    await addBooking(db, booking, Array.isArray(invoices) ? invoices : [])
    return withPortfolio(res, req)
  }))

  app.put('/api/clients/:id', requirePermission('edit:clients'), route(async (req, res) => {
    const body = req.body as Client
    requireShape(body, ['name', 'kind', 'status'], 'client')
    await updateClient(db, param(req, 'id'), body)
    return withPortfolio(res, req)
  }))

  app.put('/api/bookings/:id', requirePermission('edit:bookings'), route(async (req, res) => {
    const body = req.body as Booking
    requireShape(body, ['propertyId', 'clientId', 'mode', 'status', 'start'], 'agreement')
    if (body.mode !== 'rental' && !body.end) {
      throw new BadRequest('Only a rental may be open-ended; give the agreement an end date.')
    }
    await updateBooking(db, param(req, 'id'), body)
    return withPortfolio(res, req)
  }))

  app.delete('/api/properties/:id', requirePermission('edit:properties'), route(async (req, res) => {
    await deleteProperty(db, param(req, 'id'))
    return withPortfolio(res, req)
  }))

  app.delete('/api/clients/:id', requirePermission('edit:clients'), route(async (req, res) => {
    await deleteClient(db, param(req, 'id'))
    return withPortfolio(res, req)
  }))

  app.delete('/api/bookings/:id', requirePermission('edit:bookings'), route(async (req, res) => {
    await deleteBooking(db, param(req, 'id'))
    return withPortfolio(res, req)
  }))

  app.post('/api/team', requirePermission('manage:team'), route(async (req, res) => {
    const body = req.body as TeamMember & { password?: string }
    requireShape(body, ['id', 'name', 'role', 'title'], 'team member')

    let hash: string | undefined
    if (body.password) {
      const problem = rejectPassword(body.password, body)
      if (problem) throw new BadRequest(problem)
      hash = await hashPassword(body.password)
    }
    await addMember(db, body, hash)
    return withPortfolio(res, req)
  }))

  app.put('/api/team/:id', requirePermission('manage:team'), route(async (req, res) => {
    const body = req.body as TeamMember
    requireShape(body, ['name', 'role', 'title'], 'team member')
    await updateMember(db, param(req, 'id'), body)
    return withPortfolio(res, req)
  }))

  app.delete('/api/team/:id', requirePermission('manage:team'), route(async (req, res) => {
    await deleteMember(db, param(req, 'id'))
    return withPortfolio(res, req)
  }))

  app.put('/api/settings/reminders', requirePermission('manage:settings'), route(async (req, res) => {
    await updateReminders(db, req.body ?? {})
    return withPortfolio(res, req)
  }))

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    /* 401 means "sign in"; the client turns it into the login screen. 403
       means signed in and still not allowed, which is a different message
       and must never be answered by asking them to sign in again. */
    if (err instanceof Unauthorized) {
      res.status(401).json({ error: err.message })
      return
    }
    if (err instanceof Forbidden) {
      res.status(403).json({ error: err.message })
      return
    }
    if (err instanceof NotFound) {
      res.status(404).json({ error: err.message })
      return
    }
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message })
      return
    }
    // A refusal the caller can act on: the request was well formed, the
    // state of the portfolio is what stands in the way.
    if (err instanceof Conflict) {
      res.status(409).json({ error: err.message })
      return
    }
    /* Drizzle wraps a driver error, putting its own "failed query" text on
       message and the database's on cause — so the constraint name is only
       found by walking the chain. A rejected constraint is a client error. */
    const chain: string[] = []
    for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; depth++) {
      chain.push(e.message)
      e = e.cause
    }
    const violation = chain.find((m) => /violates .*constraint/i.test(m))
    console.error(err)
    if (violation) {
      res.status(422).json({ error: violation })
      return
    }
    res.status(500).json({ error: err.message })
  })

  return app
}

/** Opens the database and builds the app around it. */
export async function buildApp() {
  const { db, driver, migrate, close } = await connect()
  return { app: createApp(db, driver), driver, migrate, close }
}
