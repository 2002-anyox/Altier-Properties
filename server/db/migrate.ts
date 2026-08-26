/* Applies pending migrations. `npm run db:migrate` */
import { connect } from './client.ts'

const { driver, migrate, close } = await connect()
console.log(`migrating via ${driver}${driver === 'pglite' ? ' (no DATABASE_URL set)' : ''}`)
await migrate()
console.log('migrations applied')
await close()
