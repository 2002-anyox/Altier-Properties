/* ------------------------------------------------------------------ *
 * API smoke test
 *
 * Boots the API against whatever database the environment points at,
 * then exercises the bootstrap endpoint and one mutation end to end.
 * Cheap, but it catches the wiring the round-trip check cannot see:
 * a bad build path, a route that never registered, an error mapping
 * that turns a 404 into a 500.
 *
 * Run with `npm run smoke:api` (seed first).
 * ------------------------------------------------------------------ */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = process.env.API_PORT ?? '5199'
const today = new Date().toISOString().slice(0, 10)
const plusMonths = (from, n) => {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
const BASE = `http://127.0.0.1:${PORT}/api`
const fail = []
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) fail.push(msg) }

/* Credentials that are structurally right and belong to nobody: enough
   to make the flow real up to the point where Google would answer, which
   is as far as a test without a browser can go. */
const SSO_ENV = {
  GOOGLE_CLIENT_ID: 'altier-smoke.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'smoke-secret',
  PUBLIC_URL: `http://127.0.0.1:${PORT}`,
}

const api = spawn('node', ['node_modules/.cache/db/api.mjs'], {
  env: { ...process.env, ...SSO_ENV, API_PORT: PORT },
  stdio: ['ignore', 'inherit', 'inherit'],
})

/* One jar for the whole run: the API is behind a session now, so every
   call carries the cookie the login handed back. A sign-in flow sets a
   second cookie alongside it, so the jar holds them by name rather than
   keeping only the most recent one.

   Redirects are never followed — the sign-in flow answers with one that
   points at Google, and the assertion is about that Location header. */
let cookie = ''

const parseJar = (value) => new Map(
  value.split('; ').filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=')
    return [pair.slice(0, eq), pair.slice(eq + 1)]
  }),
)
const writeJar = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')

const get = (path, init = {}) => fetch(`${BASE}${path}`, {
  ...init,
  redirect: 'manual',
  headers: { ...init.headers, ...(cookie && init.cookie !== null ? { cookie } : {}) },
}).then((res) => {
  const jar = parseJar(cookie)
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair, ...attributes] = raw.split(';')
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1)
    // A cleared cookie arrives as an empty value dated in the past.
    const expired = attributes.some((a) => /^\s*expires=/i.test(a) && new Date(a.split('=')[1]) < new Date())
    if (!value || expired) jar.delete(name)
    else jar.set(name, value)
  }
  cookie = writeJar(jar)
  return res
})

/** The database may take a moment to open; poll rather than guess. */
let health = null
for (let i = 0; i < 60 && !health; i++) {
  health = await get('/health').then((r) => r.json()).catch(() => null)
  if (!health) await sleep(500)
}

try {
  ok(!!health?.ok, `health responded (${health?.driver ?? 'no answer'})`)

  /* ------------------------- authentication -------------------------- *
   * The gate comes first: everything below it needs a session, which is
   * the point. A regression here would leave the whole portfolio open.
   * ------------------------------------------------------------------- */
  const jsonInit = (body) => ({
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

  const closed = await get('/portfolio')
  ok(closed.status === 401, `the portfolio is closed to strangers (got ${closed.status})`)
  const closedWrite = await get('/clients', jsonInit({ id: 'x', name: 'Mallory', kind: 'tenant', status: 'active' }))
  ok(closedWrite.status === 401, `so are writes (got ${closedWrite.status})`)

  /* A failed sign-in comes back as a page that navigates to the app with
     the reason in the query string — so the reason is what to read. */
  const ssoError = (html) => {
    const found = html.match(/sso_error=([^"'&]+)/)
    return found ? decodeURIComponent(found[1]) : `no sso_error in: ${html.slice(0, 120)}`
  }
  const tooEarly = ssoError(await get('/auth/oauth/google/start').then((r) => r.text()))
  ok(/before using single sign-on/.test(tooEarly),
     `Google sign-in is refused while no account has a password yet (${tooEarly})`)

  /* The run seeds first (see npm run smoke:api), so the team exists with no
     passwords and the first-run window is open. Claim an account through it. */
  const PASSWORD = 'smoke-test-password'
  const claimable = (await get('/auth/claimable').then((r) => r.json())).members
  const pick = claimable.find((m) => m.role === 'owner')
  const claimed = await get('/auth/setup', jsonInit({ memberId: pick.id, password: PASSWORD }))
  ok(claimed.status === 200, `first-run setup claims an account (got ${claimed.status})`)

  const reclaim = await get('/auth/setup', jsonInit({ memberId: pick.id, password: 'another-password-x' }))
  ok(reclaim.status === 403, `and the window shuts behind it (got ${reclaim.status})`)

  const ownerEmail = (await get('/auth/me').then((r) => r.json())).member.email
  const wrong = await get('/auth/login', jsonInit({ email: ownerEmail, password: 'not-it' }))
  ok(wrong.status === 401, `a wrong password is refused (got ${wrong.status})`)

  // A refused login must not have cost us the session we already had.
  const back = await get('/auth/login', jsonInit({ email: ownerEmail, password: PASSWORD }))
  ok(back.status === 200, `and the right one is accepted (got ${back.status})`)

  const stranger = await get('/auth/login', jsonInit({ email: 'nobody@example.com', password: 'whatever-x' }))
  const strangerBody = await stranger.json()
  const wrongBody = await wrong.clone?.().json?.().catch(() => null)
  ok(strangerBody.error === 'That email and password do not match an account.',
     'an unknown email is refused in the same words as a wrong password')

  /* ------------------ Google and Apple sign-in ----------------------- *
   * The half that does not need a browser: what is offered, what the
   * redirect actually asks for, and every way the callback can be lied
   * to. The token verifier itself is checked in `npm run check:sso`.
   * ------------------------------------------------------------------- */
  ok(health.sso?.includes('google'), `health reports what is configured (${JSON.stringify(health.sso)})`)

  const offered = await get('/auth/providers').then((r) => r.json())
  ok(offered.providers.length === 1 && offered.providers[0].id === 'google',
     `only configured providers are offered (${offered.providers.map((p) => p.id).join(', ') || 'none'})`)
  ok(offered.providers[0].redirectUri === `http://127.0.0.1:${PORT}/api/auth/oauth/google/callback`,
     `the redirect URI to register is spelled out (${offered.providers[0].redirectUri})`)

  const unconfigured = ssoError(await get('/auth/oauth/apple/start').then((r) => r.text()))
  ok(/Apple sign-in is not set up/.test(unconfigured),
     `a provider with no keys says so rather than half-starting (${unconfigured})`)

  const started = await get('/auth/oauth/google/start')
  ok(started.status === 302, `starting a sign-in redirects (got ${started.status})`)
  const sent = new URL(started.headers.get('location'))
  ok(sent.origin === 'https://accounts.google.com', `to Google (${sent.origin})`)
  ok(sent.searchParams.get('client_id') === SSO_ENV.GOOGLE_CLIENT_ID, 'carrying our client id')
  ok(sent.searchParams.get('response_type') === 'code', 'asking for an authorization code')
  ok(sent.searchParams.get('code_challenge_method') === 'S256'
     && (sent.searchParams.get('code_challenge') ?? '').length > 20, 'with a PKCE challenge')
  ok((sent.searchParams.get('state') ?? '').length > 20, 'and an unguessable state')
  ok((sent.searchParams.get('nonce') ?? '').length > 10, 'and a nonce')
  ok(sent.searchParams.get('redirect_uri') === offered.providers[0].redirectUri,
     'and the redirect URI it advertises')
  ok(/altier_oauth=/.test(cookie), 'the browser is given something to be recognised by')

  const state = sent.searchParams.get('state')
  const callback = (query, init) => get(`/auth/oauth/google/callback?${query}`, init)

  const invented = ssoError(await callback('state=made-up&code=made-up').then((r) => r.text()))
  ok(/already been used, or has expired/.test(invented), `a state we never issued is refused (${invented})`)

  /* The attack this defends against: an attacker starts a flow and hands
     somebody else the finished link, landing them in the attacker's
     account. Without the cookie, the state alone must not be enough. */
  const elsewhere = ssoError(await callback(`state=${encodeURIComponent(state)}&code=x`, { cookie: null }).then((r) => r.text()))
  ok(/started in a different browser/.test(elsewhere),
     `a state without the matching browser is refused (${elsewhere})`)

  const cancelled = ssoError(await callback(`state=${encodeURIComponent(state)}&error=access_denied`).then((r) => r.text()))
  ok(/was cancelled/.test(cancelled), `pressing cancel says so plainly (${cancelled})`)

  const replayed = ssoError(await callback(`state=${encodeURIComponent(state)}&code=x`).then((r) => r.text()))
  ok(/already been used, or has expired/.test(replayed), `and a state is single use (${replayed})`)

  const notLinked = await get('/auth/identities/google', { method: 'DELETE' })
  ok(notLinked.status === 404, `unlinking what was never linked answers 404 (got ${notLinked.status})`)

  const whoami = await get('/auth/me').then((r) => r.json())
  ok(whoami.hasPassword === true && Array.isArray(whoami.identities) && whoami.identities.length === 0,
     'the session reports a password and no linked accounts')

  const portfolio = await get('/portfolio').then((r) => r.json())
  ok(portfolio.properties?.length > 0, `portfolio: ${portfolio.properties?.length} properties, ${portfolio.invoices?.length} invoices`)
  ok(!!portfolio.reminders, 'reminder settings came back')

  const target = portfolio.invoices.find((i) => i.status === 'overdue')
  ok(!!target, `found an overdue charge to pay (${target?.number})`)

  const paid = await get(`/invoices/${target.id}/payment`, { method: 'POST' }).then((r) => r.json())
  const after = paid.invoices.find((i) => i.id === target.id)
  ok(after.status === 'paid' && after.paidAmount === target.amount,
     `payment applied: ${after.status}, ${after.paidAmount} of ${target.amount}`)

  const reread = await get('/portfolio').then((r) => r.json())
  ok(reread.invoices.find((i) => i.id === target.id).status === 'paid', 'still paid on a fresh read')

  const missing = await get('/invoices/does-not-exist/payment', { method: 'POST' })
  ok(missing.status === 404, `unknown invoice answers 404 (got ${missing.status})`)

  const empty = await get(`/clients/${portfolio.clients[0].id}/notes`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '  ' }),
  })
  ok(empty.status === 400, `an empty note answers 400 (got ${empty.status})`)

  /* ------------------------- creating records ------------------------ */
  const json = (body) => ({
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const stamp = Date.now().toString(36)

  const property = {
    id: `p-smoke-${stamp}`, code: `SMOKE-${stamp}`, name: 'Smoke Test House',
    type: 'house', mode: 'rental', status: 'available',
    address: { line1: '1 Smoke Road', district: 'Bugolobi', city: 'Kampala', country: 'Uganda', x: 0.4, y: 0.6 },
    bedrooms: 3, bathrooms: 2, sizeSqm: 180, amenities: ['Borehole water', 'Standby generator'],
    price: 2_500_000, currency: 'UGX', managerId: portfolio.team[0].id, rating: 0,
    availableFrom: today, acquiredOn: today, yieldPct: 0, notes: '',
    photoSeed: 1, documents: [], occupancyHistory: [], maintenanceNotes: [],
  }
  const madeProperty = await get('/properties', json(property)).then((r) => r.json())
  const storedProperty = madeProperty.properties?.find((p) => p.id === property.id)
  ok(storedProperty?.amenities?.length === 2,
     `property created with its amenities (${storedProperty?.amenities?.length ?? 'missing'})`)

  const client = {
    id: `c-smoke-${stamp}`, name: 'Smoke Test Tenant', kind: 'tenant',
    email: 'smoke@example.com', phone: '+256 700 000 000', nationality: 'Ugandan',
    since: today, status: 'prospect', propertyIds: [], idDocuments: [], notes: '',
    emergencyContact: '', communications: [], lifetimeValue: 0, rating: 0,
  }
  const madeClient = await get('/clients', json(client)).then((r) => r.json())
  ok(!!madeClient.clients?.find((c) => c.id === client.id), 'client created')

  const booking = {
    id: `b-smoke-${stamp}`, reference: `SMOKE-${stamp}`, propertyId: property.id,
    clientId: client.id, mode: 'rental', status: 'in_progress', start: today, end: null,
    rate: 2_500_000, deposit: 2_500_000, advanceMonths: 3, paidThrough: null,
    noticeDays: 60, guests: 2, source: 'direct', checkIn: '12:00', checkOut: '12:00',
    notes: '', createdAt: today,
  }
  const charge = {
    id: `i-smoke-${stamp}`, number: `SMOKE-INV-${stamp}`, propertyId: property.id,
    clientId: client.id, bookingId: booking.id, type: 'advance', issuedOn: today,
    dueOn: today, amount: 7_500_000, earnsFrom: today, earnsTo: plusMonths(today, 3),
    paidAmount: 0, status: 'pending', method: null, paidOn: null, memo: '3-month advance',
  }
  const madeBooking = await get('/bookings', json({ booking, invoices: [charge] })).then((r) => r.json())
  const storedBooking = madeBooking.bookings?.find((b) => b.id === booking.id)
  ok(storedBooking?.end === null, `open-ended rental kept its null end (${storedBooking?.end})`)
  ok(!!madeBooking.invoices?.find((i) => i.id === charge.id), 'opening charge raised with the agreement')
  ok(madeBooking.properties?.find((p) => p.id === property.id)?.status === 'occupied',
     'the agreement flipped the property to occupied')

  /* An agreement must never half-land: a bad charge has to take the whole
     write with it, or a unit shows occupied against a tenancy that isn't. */
  const secondProperty = { ...property, id: `p-rb-${stamp}`, code: `RB-${stamp}`, status: 'available' }
  await get('/properties', json(secondProperty))
  const doomed = await get('/bookings', json({
    booking: { ...booking, id: `b-rb-${stamp}`, reference: `RB-${stamp}`, propertyId: secondProperty.id },
    invoices: [{
      ...charge, id: `i-rb-${stamp}`, number: `RB-INV-${stamp}`,
      propertyId: secondProperty.id, bookingId: `b-rb-${stamp}`,
      // earns_to before earns_from — the schema must refuse it.
      earnsFrom: today, earnsTo: '2020-01-01',
    }],
  }))
  ok(doomed.status === 422, `an invalid charge rejects the agreement as 422 (got ${doomed.status})`)
  const afterRollback = await get('/portfolio').then((r) => r.json())
  ok(afterRollback.properties.find((p) => p.id === secondProperty.id)?.status === 'available',
     'the rejected agreement left the property untouched')
  ok(!afterRollback.bookings.find((b) => b.id === `b-rb-${stamp}`), 'the rejected agreement stored no row')

  const malformed = await get('/properties', json({ id: 'x', name: '' }))
  ok(malformed.status === 400, `a property with no name answers 400 (got ${malformed.status})`)

  /* ------------------------ editing and removal ---------------------- */
  const put = (body) => ({
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

  const renamed = await get(`/clients/${client.id}`, put({ ...client, name: 'Renamed Tenant', status: 'active' }))
    .then((r) => r.json())
  ok(renamed.clients?.find((c) => c.id === client.id)?.name === 'Renamed Tenant', 'client edit persisted')

  /* A client with charges behind them must not be deletable — that history
     is the record of what was owed and paid. */
  const refused = await get(`/clients/${client.id}`, { method: 'DELETE' })
  ok(refused.status === 409, `a client with history refuses deletion as 409 (got ${refused.status})`)
  const stillThere = await get('/portfolio').then((r) => r.json())
  ok(!!stillThere.clients.find((c) => c.id === client.id), 'the refused client is still there')

  /* An end date on or before the start is not a period; the schema refuses
     one, so the API has to refuse it first with a reason worth reading. */
  const badRange = await get(`/bookings/${booking.id}`, put({ ...booking, status: 'completed', end: booking.start }))
  ok(badRange.status === 409, `ending on the start date is refused as 409 (got ${badRange.status})`)

  /* Which is why an agreement closed before it ran is cancelled, keeping its
     dates — exactly what endBooking() produces. Either way the unit frees. */
  const ended = await get(`/bookings/${booking.id}`, put({ ...booking, status: 'cancelled' }))
    .then((r) => r.json())
  ok(ended.properties?.find((p) => p.id === property.id)?.status === 'available',
     'closing an agreement freed the unit')

  const orphaned = await get(`/bookings/${booking.id}`, { method: 'DELETE' }).then((r) => r.json())
  ok(!orphaned.bookings?.find((b) => b.id === booking.id), 'agreement deleted')
  // The charge was never paid, so it went with the agreement that raised it.
  ok(!orphaned.invoices?.find((i) => i.id === charge.id),
     'its unpaid charge went with it, leaving no phantom arrears')

  /* Now that nothing references them, the client can go. */
  const gone = await get(`/clients/${client.id}`, { method: 'DELETE' })
  ok(gone.status === 200, `a client with no history deletes (got ${gone.status})`)

  const propGone = await get(`/properties/${property.id}`, { method: 'DELETE' })
  ok(propGone.status === 200, `property deleted (got ${propGone.status})`)

  /* -------------------------------- team ----------------------------- */
  const member = {
    id: `tm-smoke-${stamp}`, name: 'Smoke Manager', role: 'manager',
    title: 'Property Manager', email: `smoke-${stamp}@altier.co.ug`,
    phone: '+256 700 111 222', since: today,
  }
  const added = await get('/team', json(member)).then((r) => r.json())
  ok(!!added.team?.find((m) => m.id === member.id), 'team member added')

  const promoted = await get(`/team/${member.id}`, put({ ...member, role: 'accountant' })).then((r) => r.json())
  ok(promoted.team?.find((m) => m.id === member.id)?.role === 'accountant', 'team member role changed')

  /* Someone holding properties cannot simply be removed — the properties
     would be left without a manager. */
  const holder = added.team.find((m) => portfolio.properties.some((p) => p.managerId === m.id))
  if (holder) {
    const blocked = await get(`/team/${holder.id}`, { method: 'DELETE' })
    ok(blocked.status === 409, `a member managing properties refuses removal as 409 (got ${blocked.status})`)
  }

  const removed = await get(`/team/${member.id}`, { method: 'DELETE' })
  ok(removed.status === 200, `an unencumbered team member is removed (got ${removed.status})`)

  /* ---------------------- the roles are enforced --------------------- *
   * The matrix used to decide what the interface drew. This is the check
   * that it now decides what the server will do, which is the only place
   * it protects anything.
   * ------------------------------------------------------------------- */
  const ownerCookie = cookie
  const staff = portfolio.team.find((m) => m.role === 'staff')
  await get(`/team/${staff.id}/password`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'staff-smoke-password' }),
  })
  const signedInAsStaff = await get('/auth/login', jsonInit({ email: staff.email, password: 'staff-smoke-password' }))
  ok(signedInAsStaff.status === 200, `a staff account signs in (got ${signedInAsStaff.status})`)

  const staffPortfolio = await get('/portfolio').then((r) => r.json())
  ok(staffPortfolio.invoices.length === 0,
     `staff receive no charges at all (got ${staffPortfolio.invoices.length}) — withheld, not hidden`)
  ok(staffPortfolio.properties.length > 0, 'but they still receive the properties they work on')

  const payAttempt = await get('/invoices/i-01/payment', { method: 'POST' })
  ok(payAttempt.status === 403, `staff cannot record a payment (got ${payAttempt.status})`)
  const teamAttempt = await get('/team', jsonInit({
    id: 'tm-evil', name: 'Mallory', role: 'owner', title: 'x',
    email: 'mallory@example.com', phone: 'x', since: today,
  }))
  ok(teamAttempt.status === 403, `staff cannot add themselves an owner (got ${teamAttempt.status})`)
  const jobAttempt = await get('/maintenance', jsonInit({
    propertyId: staffPortfolio.properties[0].id, title: 'Leak', description: 'x',
    priority: 'medium', vendor: 'x', dueOn: today,
  }))
  ok(jobAttempt.status === 200, `but staff can raise a maintenance job (got ${jobAttempt.status})`)

  cookie = ownerCookie
  const loggedOut = await get('/auth/logout', { method: 'POST' })
  ok(loggedOut.status === 200, 'sign out succeeds')
  const afterLogout = await get('/portfolio')
  ok(afterLogout.status === 401, `and the session is gone (got ${afterLogout.status})`)
  const unlinkOut = await get('/auth/identities/google', { method: 'DELETE' })
  ok(unlinkOut.status === 401, `unlinking needs a session too (got ${unlinkOut.status})`)
} finally {
  api.kill('SIGINT')
  await sleep(1500)
  api.kill('SIGKILL')
}

if (fail.length) {
  console.error(`\nAPI smoke test failed:\n${fail.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}
console.log('\nAPI SMOKE TEST CLEAN')
