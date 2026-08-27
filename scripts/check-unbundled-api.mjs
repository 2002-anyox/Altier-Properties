/* ------------------------------------------------------------------ *
 * The API must run without a bundler
 *
 * Vercel compiles each TypeScript file on its own rather than bundling
 * them, so every relative import survives into the emitted JavaScript
 * exactly as written — and Node's ESM resolver does no extension
 * guessing. An import of './client.ts' looks for a .ts file that is no
 * longer there; './client' looks for a file with no extension. Both are
 * ERR_MODULE_NOT_FOUND, and the deployment answers 500 to everything.
 *
 * Every local check bundles first, so none of them can see this. This
 * one compiles the way the host compiles and then actually serves a
 * request through the result.
 *
 *   npm run check:unbundled
 * ------------------------------------------------------------------ */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = 'node_modules/.cache/unbundled'
rmSync(OUT, { recursive: true, force: true })

const run = (cmd, args) => new Promise((res, rej) => {
  spawn(cmd, args, { stdio: 'inherit' }).on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))))
})

/* One file in, one file out — no --bundle. Kept inside node_modules so
   package resolution works the way it does on the host. */
console.log('compiling the API one file at a time, as the host does…')
await run('npx', ['esbuild', 'api/[...path].ts', 'server/*.ts', 'server/db/*.ts', 'src/lib/*.ts',
  '--outdir=' + OUT, '--outbase=.', '--format=esm', '--platform=node', '--log-level=error'])

let failed = false
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed = true
}

let handler
try {
  handler = (await import(`../${OUT}/api/[...path].js`)).default
} catch (error) {
  check('the compiled entry loads', false, `${error.code}: ${error.message.split('\n')[0]}`)
  console.log('\nUNBUNDLED API CHECK FAILED\n')
  process.exit(1)
}
check('the compiled entry loads', true)

const server = createServer((req, res) => handler(req, res))
await new Promise((res) => server.listen(0, '127.0.0.1', res))
const { port } = server.address()

try {
  await sleep(300)
  const res = await fetch(`http://127.0.0.1:${port}/api/health`)
  const body = await res.json().catch(() => ({}))
  /* Whether the database is reachable is not this check's business; that
     the module graph resolves is. A resolution failure is the one answer
     that must not appear. */
  check('and every import in it resolves', body.code !== 'ERR_MODULE_NOT_FOUND', body.error ?? '')
  check('so health answers for itself', typeof body.driver === 'string' || typeof body.schema === 'string',
    JSON.stringify(body).slice(0, 120))
} finally {
  server.close()
}

console.log(failed ? '\nUNBUNDLED API CHECK FAILED\n' : '\nUNBUNDLED API CHECK CLEAN\n')
process.exit(failed ? 1 : 0)
