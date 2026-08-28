/* ------------------------------------------------------------------ *
 * Vercel entry point
 *
 * The same Express app the local process runs, mounted as a serverless
 * function.
 *
 * Routing is declared in vercel.json rather than inferred from the
 * filename. A catch-all name like `api/[...path].ts` reads as one, but
 * the platform routed only single-segment paths to it: /api/health
 * answered while /api/auth/me got a 404 that never reached this code. An
 * explicit rewrite leaves nothing to infer.
 *
 * The rewrite also carries the original path as a query parameter,
 * because whether a rewrite preserves the request URL is exactly the
 * kind of platform detail that cost a day here. Carried, it is restored;
 * absent — running locally, where no rewrite exists — the URL is already
 * right and nothing is touched.
 *
 * Nothing is imported at module scope. An import that throws while the
 * module is loading cannot be caught by anything inside it, and the
 * platform answers with its own page and no further detail.
 * ------------------------------------------------------------------ */

import type { IncomingMessage, ServerResponse } from 'node:http'

type Handler = (req: IncomingMessage, res: ServerResponse) => void

/** The parameter vercel.json uses to carry the path through the rewrite. */
const CARRIED = '__altier_path'

/** Puts the requested path back, whatever the rewrite did with it. */
function restorePath(req: IncomingMessage) {
  const [pathname, search = ''] = (req.url ?? '/').split('?')
  const params = new URLSearchParams(search)
  const carried = params.get(CARRIED)
  if (carried === null) return
  params.delete(CARRIED)
  const query = params.toString()
  /* The captured group excludes the /api prefix the source matched. */
  req.url = `/api/${carried}${query ? `?${query}` : ''}`
  void pathname
}

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
    import('../server/db/client.js'),
    import('../server/app.js'),
  ])
  const { db, driver } = await connect()
  return createApp(db, driver) as unknown as Handler
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    restorePath(req)
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
