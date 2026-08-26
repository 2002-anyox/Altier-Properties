/* ------------------------------------------------------------------ *
 * HTTP API
 *
 * One bootstrap endpoint returns the whole portfolio — at this size the
 * dataset is kilobytes, so the client holds it and every selector keeps
 * working over plain arrays. Each mutation returns the refreshed
 * portfolio, so the client and the database cannot drift.
 *
 * Run with `npm run api`.
 * ------------------------------------------------------------------ */

import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { connect } from './db/client.ts'
import { readPortfolio } from './db/read.ts'
import {
  NotFound, addMaintenance, addNote, recordPayment, sendReminder,
  setMaintenanceStatus, setPropertyStatus, updateReminders,
} from './mutations.ts'

const PORT = Number(process.env.API_PORT ?? 5174)

const { db, driver, migrate, close } = await connect()
await migrate()

const app = express()
app.use(cors())
app.use(express.json({ limit: '256kb' }))

/** Wraps a handler so a rejected promise reaches the error middleware. */
const route = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next) }

/** Express types a route param as string | string[]; ours are always single. */
const param = (req: Request, name: string) => String((req.params as Record<string, string>)[name])

/** Every mutation answers with the authoritative portfolio. */
const withPortfolio = (res: Response) => readPortfolio(db).then((p) => res.json(p))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, driver })
})

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

app.put('/api/settings/reminders', route(async (req, res) => {
  await updateReminders(db, req.body ?? {})
  return withPortfolio(res)
}))

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof NotFound) {
    res.status(404).json({ error: err.message })
    return
  }
  // A rejected constraint is a client error, not a server fault.
  const constraint = /violates .*constraint/i.test(err.message)
  console.error(err)
  res.status(constraint ? 422 : 500).json({ error: err.message })
})

const server = app.listen(PORT, () => {
  console.log(`Altier API on http://localhost:${PORT} (${driver})`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => { void close().then(() => process.exit(0)) })
  })
}
