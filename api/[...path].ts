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
 *
 * Nothing is imported at module scope. An import that throws while the
 * module is loading cannot be caught by anything inside it, and the
 * platform answers with its own page — FUNCTION_INVOCATION_FAILED and
 * no further detail, which is the least diagnosable failure there is.
 * Loading the app inside the handler turns that into a reply that says
 * what went wrong.
 * ------------------------------------------------------------------ */

import type { IncomingMessage, ServerResponse } from 'node:http'

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
  const [{ connect }, { createApp }] = await Promise.all([
    import('../server/db/client.ts'),
    import('../server/app.ts'),
  ])
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
    const err = error as NodeJS.ErrnoException
    console.error('Altier API failed to start:', err)
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({
      ok: false,
      schema: 'unknown',
      error: err.message,
      /* The code and the first stack frame are what separate "cannot
         reach the database" from "a module is missing", and neither is
         guessable from the message alone. */
      code: err.code,
      at: err.stack?.split('\n')[1]?.trim(),
    }))
  }
}
