/* Runner for the empty-portfolio initialiser. `npm run db:init` */
import { connect } from './client.js'
import { counts, init } from './init.js'

const { db, driver, migrate, close } = await connect()
console.log(`initialising via ${driver}${driver === 'pglite' ? ' (no DATABASE_URL set)' : ''}`)
await migrate()

const { ready } = await init(db)
const held = await counts(db)
console.log(ready
  ? 'schema is up to date and a workspace already exists'
  : 'schema is up to date — no workspace yet')
for (const [name, n] of Object.entries(held)) console.log(`  ${name.padEnd(14)} ${String(n).padStart(5)}`)
if (!ready) console.log('\nOpen the app and create the first owner account.')
await close()
