/* ------------------------------------------------------------------ *
 * Local API process
 *
 * Runs the app as a long-lived server against whatever database the
 * environment points at, applying migrations on the way up. Production
 * is serverless and takes a different entry point — see api/index.ts.
 *
 * Run with `npm run api`.
 * ------------------------------------------------------------------ */

import { buildApp } from './app.js'

const PORT = Number(process.env.API_PORT ?? 5174)

const { app, driver, migrate, close } = await buildApp()
await migrate()

const server = app.listen(PORT, () => {
  console.log(`Altier API on http://localhost:${PORT} (${driver})`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => { void close().then(() => process.exit(0)) })
  })
}
