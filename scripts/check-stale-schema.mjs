/* ------------------------------------------------------------------ *
 * A database behind the code must say so
 *
 * The failure this guards against is quiet: a database missing a later
 * migration still has a `properties` table, so /api/health passes and
 * the mismatch only surfaces much later on a query naming a column that
 * is not there — wrapped by the ORM, so the reason never reaches the
 * browser. Someone then sees "the API answered 500" and nothing else.
 *
 * So: build a database at the first migration only, record it as applied
 * the way the real setup SQL does, boot the serverless bundle against it,
 * and insist health names every migration still outstanding.
 *
 * Deliberately no git history — CI checks out shallow, and a step that
 * reaches for an old commit fails there and nowhere else.
 *
 *   npm run check:stale
 * ------------------------------------------------------------------ */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import pg from 'pg'

const URL_ = process.env.DATABASE_URL
if (!URL_) {
  console.error('check:stale needs DATABASE_URL pointing at a Postgres it may wipe.')
  process.exit(1)
}

const DIR = 'server/db/migrations'
const journal = JSON.parse(readFileSync(`${DIR}/meta/_journal.json`, 'utf8'))
const [first, ...later] = journal.entries
if (!later.length) {
  console.log('only one migration exists, so nothing can be behind — nothing to check')
  process.exit(0)
}

const hashOf = (tag) => createHash('sha256').update(readFileSync(`${DIR}/${tag}.sql`, 'utf8')).digest('hex')

const client = new pg.Client({ connectionString: URL_ })
await client.connect()

console.log(`building a database at ${first.tag} only…`)
await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE;')
await client.query(readFileSync(`${DIR}/${first.tag}.sql`, 'utf8').split('--> statement-breakpoint').join(''))

/* The bookkeeping row the real setup SQL writes. Without it the database
   looks hand-built, which is a case the check deliberately leaves alone. */
await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"')
await client.query(`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`)
await client.query('INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
  [hashOf(first.tag), first.when])
await client.end()

const build = spawn('npx', ['esbuild', 'api/[...path].ts', '--bundle', '--platform=node',
  '--format=esm', '--packages=external', '--outfile=node_modules/.cache/vercel-fn.mjs',
  '--log-level=warning'], { stdio: 'inherit' })
await new Promise((res, rej) => build.on('exit', (c) => (c === 0 ? res() : rej(new Error(`esbuild exited ${c}`)))))

const { default: handler } = await import('../node_modules/.cache/vercel-fn.mjs')
const server = createServer((req, res) => handler(req, res))
await new Promise((res) => server.listen(0, '127.0.0.1', res))
const port = server.address().port

let failed = false
try {
  await sleep(500)
  const res = await fetch(`http://127.0.0.1:${port}/api/health`)
  const body = await res.json()
  console.log(res.status, JSON.stringify(body))

  const expect = later.map((e) => e.tag).join(',')
  const check = (label, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`); if (!ok) failed = true }
  check(`health refuses the database (503, got ${res.status})`, res.status === 503)
  check(`and calls it behind (got ${body.schema})`, body.schema === 'behind')
  check(`naming every outstanding migration (${expect})`, (body.missing ?? []).join(',') === expect)
  check('with something to do about it', /upgrade\.sql/.test(body.error ?? ''))
} finally {
  server.close()
}

console.log(failed ? '\nSTALE-SCHEMA CHECK FAILED\n' : '\nSTALE-SCHEMA CHECK CLEAN\n')
process.exit(failed ? 1 : 0)
