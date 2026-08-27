/* Runner for the empty-portfolio initialiser. `npm run db:init` */
import { connect } from './client.js'
import { counts, init } from './init.js'

const { db, driver, migrate, close } = await connect()
console.log(`initialising via ${driver}${driver === 'pglite' ? ' (no DATABASE_URL set)' : ''}`)
await migrate()

const { created } = await init(db)
const held = await counts(db)
console.log(created
  ? 'empty portfolio ready — reminder settings are in place'
  : 'already initialised — nothing changed')
for (const [name, n] of Object.entries(held)) console.log(`  ${name.padEnd(10)} ${String(n).padStart(5)}`)
console.log(created && Object.values(held).every((n) => n === 0)
  ? '\nOpen the app and create the first owner account.'
  : '')
await close()
