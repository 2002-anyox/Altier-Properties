/* ------------------------------------------------------------------ *
 * One workspace cannot see another's records
 *
 * Not a test of the API's WHERE clauses — a test of what the database
 * permits when the API is wrong. It connects as the application role,
 * claims to be various people, and counts what comes back. A query with
 * no filter at all must still return only one workspace's rows.
 *
 * The claim itself is deliberately hostile: one case asks the database
 * for a workspace the session has no membership in, which is what a
 * confused-deputy bug in the API would look like.
 *
 *   npm run check:isolation
 * ------------------------------------------------------------------ */

import pg from 'pg'

const URL_ = process.env.DATABASE_URL
if (!URL_) {
  console.error('check:isolation needs DATABASE_URL pointing at a Postgres it may wipe.')
  process.exit(1)
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const client = new pg.Client({ connectionString: URL_ })
await client.connect()

/* Seeding is a separate step, and running this against a database that
   has not had one is an easy mistake to make. Say so plainly rather than
   failing four queries later on a table that is not there. */
const { rows: ready } = await client.query(
  `select to_regclass('public.organization_members') is not null as ok`)
if (!ready[0].ok) {
  console.error('check:isolation needs a migrated, seeded database — run npm run db:seed first.')
  process.exit(1)
}

/** Counts every business table as one person, in one claimed workspace. */
async function as(profileId, organizationId) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE altier_app')
    await client.query(`SET LOCAL altier.profile_id = '${profileId}'`)
    await client.query(`SET LOCAL altier.organization_id = '${organizationId}'`)
    const counts = {}
    /* Deliberately includes tables guarded only by the workspace check.
       The property-linked ones are additionally protected by the role
       functions, so probing those alone would pass even if the workspace
       check were replaced by one that believed whatever it was told. */
    for (const t of ['properties', 'clients', 'bookings', 'invoices', 'maintenance_requests',
                     'subscriptions', 'invitations', 'reminder_settings', 'organizations']) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`)
      counts[t] = rows[0].n
    }
    return counts
  } finally {
    await client.query('ROLLBACK')
  }
}

const one = async (sql) => (await client.query(sql)).rows[0]

/* ------------------------------- fixture --------------------------- *
 * A second workspace, because isolation is not observable with one.
 * Built here rather than by hand so the check runs anywhere the seeder
 * has run, and re-running it is harmless.
 *
 * It also assigns three properties to a staff member, which is what makes
 * the narrower role rules visible: without an assignment, "sees only what
 * they were assigned" and "sees nothing" look the same.
 * ------------------------------------------------------------------- */
async function fixture() {
  await client.query(`
    INSERT INTO organizations (id, name, slug) VALUES
      ('org-rival', 'Rival Holdings', 'rival') ON CONFLICT DO NOTHING`)
  await client.query(`
    INSERT INTO subscriptions (organization_id, plan, status, seat_limit) VALUES
      ('org-rival', 'starter', 'active', 3) ON CONFLICT DO NOTHING`)
  await client.query(`
    INSERT INTO profiles (id, name, email) VALUES
      ('pr-rival-owner', 'Rival Owner', 'owner@rival.example') ON CONFLICT DO NOTHING`)
  await client.query(`
    INSERT INTO organization_members (id, organization_id, profile_id, role, title, status, since)
    VALUES ('om-rival-owner', 'org-rival', 'pr-rival-owner', 'owner', 'Owner', 'active', CURRENT_DATE)
    ON CONFLICT DO NOTHING`)
  await client.query(`
    INSERT INTO properties (
      id, organization_id, code, name, type, mode, status, address_line1, district,
      city, country, map_x, map_y, bedrooms, bathrooms, size_sqm, price, manager_id,
      rating, acquired_on, yield_pct, notes, photo_seed)
    VALUES (
      'p-rival-01', 'org-rival', 'RIV-01', 'Rival House', 'villa', 'long_term', 'occupied',
      '1 Rival Road', 'Nakasero', 'Kampala', 'Uganda', 40, 40, 3, 2, 180, 4000000,
      'om-rival-owner', 4.5, CURRENT_DATE, 7.5, '', 1)
    ON CONFLICT DO NOTHING`)

  /* Three properties for a staff member of the seeded workspace. */
  const staff = await one(`SELECT om.id FROM organization_members om
    WHERE om.role = 'staff' AND om.organization_id <> 'org-rival' LIMIT 1`)
  if (staff) {
    await client.query(`
      INSERT INTO member_properties (member_id, property_id)
      SELECT $1, p.id FROM properties p
      WHERE p.organization_id <> 'org-rival' ORDER BY p.id LIMIT 3
      ON CONFLICT DO NOTHING`, [staff.id])
  }
}
await fixture()

const total = await one('SELECT count(*)::int AS n FROM properties')
const home = await one(`SELECT om.profile_id AS p, om.organization_id AS o
  FROM organization_members om WHERE om.role = 'owner'
  AND om.organization_id <> 'org-rival' LIMIT 1`)
const rival = await one(`SELECT om.profile_id AS p, om.organization_id AS o
  FROM organization_members om WHERE om.organization_id = 'org-rival' LIMIT 1`)

if (!home || !rival) {
  console.error('needs two workspaces; run the isolation fixture first')
  process.exit(1)
}

console.log(`\nthe database holds ${total.n} properties across every workspace\n`)

const mine = await as(home.p, home.o)
const theirs = await as(rival.p, rival.o)
const trespass = await as(home.p, rival.o)
const nobody = await as('', home.o)

check('an owner sees their own workspace', mine.properties > 0, `${mine.properties} properties`)
check('and not the whole table', mine.properties < total.n, `${mine.properties} of ${total.n}`)
check('the other workspace sees its own', theirs.properties > 0, `${theirs.properties} properties`)
check('the two do not overlap', mine.properties + theirs.properties === total.n,
  `${mine.properties} + ${theirs.properties} = ${total.n}`)

/* The one that matters: the session asks for a workspace it has no
   membership in. The membership table is the authority, so the answer is
   nothing — not the rows, not a partial view, nothing. */
const trespassed = Object.values(trespass).reduce((a, b) => a + b, 0)
check('including its billing and pending invitations',
  trespass.subscriptions === 0 && trespass.invitations === 0,
  `${trespass.subscriptions} subscriptions, ${trespass.invitations} invitations`)
check('claiming a workspace you are not in returns nothing', trespassed === 0,
  JSON.stringify(trespass))

const anonymous = Object.values(nobody).reduce((a, b) => a + b, 0)
check('and a request with no session returns nothing', anonymous === 0, JSON.stringify(nobody))

/* Role narrowing: a staff member is held to what they were assigned. */
const staff = await one(`SELECT om.profile_id AS p, om.organization_id AS o, om.id AS m
  FROM organization_members om WHERE om.role = 'staff' AND om.organization_id = '${home.o}' LIMIT 1`)
if (staff) {
  const assigned = await one(
    `SELECT count(*)::int AS n FROM member_properties WHERE member_id = '${staff.m}'`)
  const seen = await as(staff.p, staff.o)
  check(`staff see only assigned properties (${assigned.n} assigned)`,
    seen.properties === assigned.n, `${seen.properties} visible`)
  check('and only the charges against them',
    seen.invoices < mine.invoices, `${seen.invoices} of ${mine.invoices}`)
  check('and only the clients who hold them',
    seen.clients < mine.clients, `${seen.clients} of ${mine.clients}`)
}

/* Writes, not just reads. An assignment is what decides which properties
   a manager or staff member's queries return, so a workspace that could
   write one naming somebody else's property could widen its own access by
   inserting a row. */
async function refusedWrite(label, sql, params, profileId, organizationId) {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE altier_app')
    await client.query(`SELECT set_config('altier.profile_id', $1, true)`, [profileId])
    await client.query(`SELECT set_config('altier.organization_id', $1, true)`, [organizationId])
    await client.query(sql, params)
    check(label, false, 'it was accepted')
  } catch (error) {
    check(label, error.code === '42501', `${error.code}: ${error.message.split('\n')[0]}`)
  } finally {
    await client.query('ROLLBACK')
  }
}

if (staff) {
  await refusedWrite(
    'a workspace cannot assign its staff a property it does not own',
    'INSERT INTO member_properties (member_id, property_id) VALUES ($1, $2)',
    [staff.m, 'p-rival-01'], home.p, home.o,
  )
  await refusedWrite(
    'nor can it write a property into another workspace',
    `INSERT INTO properties (
       id, organization_id, code, name, type, mode, status, address_line1, district,
       city, country, map_x, map_y, bedrooms, bathrooms, size_sqm, price, manager_id,
       rating, acquired_on, yield_pct, notes, photo_seed)
     VALUES ('p-smuggled', 'org-rival', 'SMG-01', 'Smuggled', 'villa', 'long_term',
       'available', '1 Nowhere', 'X', 'Kampala', 'Uganda', 1, 1, 1, 1, 10, 1,
       'om-rival-owner', 1, CURRENT_DATE, 1, '', 1)`,
    [], home.p, home.o,
  )
  await refusedWrite(
    'nor make itself a member of one',
    `INSERT INTO organization_members (id, organization_id, profile_id, role, title, status, since)
     VALUES ('om-trespass', 'org-rival', $1, 'owner', 'Owner', 'active', CURRENT_DATE)`,
    [home.p], home.p, home.o,
  )
}

await client.end()
console.log(failures === 0 ? '\nISOLATION CHECK CLEAN\n' : `\n${failures} ISOLATION CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
