/* ------------------------------------------------------------------ *
 * Vercel entry point
 *
 * The same Express app the local process runs, mounted as a serverless
 * function. The catch-all filename is deliberate: Vercel routes every
 * /api/* path to this file natively, so no rewrite sits between the
 * request and the app to rewrite the path out from under it.
 *
 * The app and its connection pool are built once per warm instance and
 * reused, which is what keeps a request from opening a new Postgres
 * connection every time.
 * ------------------------------------------------------------------ */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect } from '../server/db/client.ts'
import { createApp } from '../server/app.ts'

type Handler = (req: IncomingMessage, res: ServerResponse) => void

let pending: Promise<Handler> | null = null

async function getApp(): Promise<Handler> {
  /* PGlite writes to a local directory, which a serverless filesystem
     throws away between invocations. Falling back to it here would serve
     an empty portfolio and look like data loss, so refuse instead. */
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. The deployed API needs a hosted Postgres — '
      + 'add the connection string to the project\'s environment variables.',
    )
  }
  const { db, driver } = await connect()
  return createApp(db, driver) as unknown as Handler
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    pending ??= getApp()
    const app = await pending
    app(req, res)
  } catch (error) {
    // A failed connection must not be cached, or the instance stays broken.
    pending = null
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: (error as Error).message }))
  }
}
