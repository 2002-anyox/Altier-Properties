/* Runner for the seeder. `npm run db:seed` */
import { connect } from './client.js'
import { SeedRefused, seed } from './seed.js'

const { db, driver, migrate, close } = await connect()
console.log(`seeding via ${driver}${driver === 'pglite' ? ' (no DATABASE_URL set)' : ''}`)
await migrate()
let counts: Record<string, number>
try {
  counts = await seed(db)
} catch (error) {
  if (error instanceof SeedRefused) {
    console.error(error.message)
    await close()
    process.exit(1)
  }
  throw error
}
const width = Math.max(...Object.keys(counts).map((k) => k.length))
for (const [table, n] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(width)}  ${String(n).padStart(5)}`)
}
console.log(`seeded ${Object.values(counts).reduce((a, b) => a + b, 0)} rows`)
await close()
