/* Runner for the seeder. `npm run db:seed` */
import { connect } from './client.ts'
import { seed } from './seed.ts'

const { db, driver, migrate, close } = await connect()
console.log(`seeding via ${driver}${driver === 'pglite' ? ' (no DATABASE_URL set)' : ''}`)
await migrate()
const counts = await seed(db)
const width = Math.max(...Object.keys(counts).map((k) => k.length))
for (const [table, n] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(width)}  ${String(n).padStart(5)}`)
}
console.log(`seeded ${Object.values(counts).reduce((a, b) => a + b, 0)} rows`)
await close()
