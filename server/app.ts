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

import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { sql } from 'drizzle-orm'
import { connect, type Db } from './db/client.ts'
import { properties } from './db/schema.ts'
import { readPortfolio } from './db/read.ts'
import {
  NotFound, addBooking, addClient, addMaintenance, addNote, addProperty,
  recordPayment, sendReminder, setMaintenanceStatus, setPropertyStatus,
  updateProperty, updateReminders,
} from './mutations.ts'
import type { Booking, Client, Invoice, Property } from '../src/lib/types.ts'

export function createApp(db: Db, driver: string) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '256kb' }))

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

  /** Every mutation answers with the authoritative portfolio. */
  const withPortfolio = (res: Response) => readPortfolio(db).then((p) => res.json(p))

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

  app.get('/api/portfolio', route(async (_req, res) => withPortfolio(res)))

  app.post('/api/invoices/:id/payment', route(async (req, res) => {
    await recordPayment(db, param(req, 'id'))
    return withPortfolio(res)
  }))

  app.post('/api/invoices/:id/reminder', route(async (req, res) => {
    await sendReminder(db, param(req, 'id'))
    return withPortfolio(res)
  }))

  app.patch('/api/properties/:id/status', route(async (req, res) => {
    await setPropertyStatus(db, param(req, 'id'), req.body?.status)
    return withPortfolio(res)
  }))

  app.patch('/api/maintenance/:id/status', route(async (req, res) => {
    await setMaintenanceStatus(db, param(req, 'id'), req.body?.status)
    return withPortfolio(res)
  }))

  app.post('/api/maintenance', route(async (req, res) => {
    await addMaintenance(db, req.body)
    return withPortfolio(res)
  }))

  app.post('/api/clients/:id/notes', route(async (req, res) => {
    const text = String(req.body?.text ?? '').trim()
    if (!text) return res.status(400).json({ error: 'A note cannot be empty.' })
    await addNote(db, param(req, 'id'), text)
    return withPortfolio(res)
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

  app.post('/api/properties', route(async (req, res) => {
    const body = req.body as Property
    requireShape(body, ['id', 'code', 'name', 'type', 'mode', 'status', 'managerId'], 'property')
    if (!body.address?.line1) throw new BadRequest('A property needs an address.')
    await addProperty(db, body)
    return withPortfolio(res)
  }))

  app.put('/api/properties/:id', route(async (req, res) => {
    const body = req.body as Property
    requireShape(body, ['name', 'type', 'mode', 'status', 'managerId'], 'property')
    if (!body.address?.line1) throw new BadRequest('A property needs an address.')
    await updateProperty(db, param(req, 'id'), body)
    return withPortfolio(res)
  }))

  app.post('/api/clients', route(async (req, res) => {
    const body = req.body as Client
    requireShape(body, ['id', 'name', 'kind', 'status'], 'client')
    await addClient(db, body)
    return withPortfolio(res)
  }))

  app.post('/api/bookings', route(async (req, res) => {
    const { booking, invoices } = (req.body ?? {}) as { booking: Booking; invoices: Invoice[] }
    requireShape(booking, ['id', 'reference', 'propertyId', 'clientId', 'mode', 'status', 'start'], 'agreement')
    if (booking.mode !== 'rental' && !booking.end) {
      throw new BadRequest('Only a rental may be open-ended; give the agreement an end date.')
    }
    await addBooking(db, booking, Array.isArray(invoices) ? invoices : [])
    return withPortfolio(res)
  }))

  app.put('/api/settings/reminders', route(async (req, res) => {
    await updateReminders(db, req.body ?? {})
    return withPortfolio(res)
  }))

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof NotFound) {
      res.status(404).json({ error: err.message })
      return
    }
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message })
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
