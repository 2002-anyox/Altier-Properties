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
const plusDays = (from, n) => {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const plusMonths = (from, n) => {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
const BASE = `http://127.0.0.1:${PORT}/api`
const TENANT_PASSWORD = 'a-tenant-portal-password'
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

  /* Nobody has a password yet, so the first-run window is open. It creates
     the owner rather than claiming a seeded one — a production database
     arrives with no people in it at all. */
  const PASSWORD = 'smoke-test-password'
  /* The seeded owner's address. Setup takes over a row that already has
     a workspace rather than opening an empty second one, so everything
     below this line runs against the sample portfolio — which is what
     makes the mutations further down worth testing. */
  const OWNER = {
    name: 'Nakato Ssemakula',
    email: 'nakato.ssemakula@altier.co.ug',
    password: PASSWORD,
  }

  const noName = await get('/auth/setup', jsonInit({ ...OWNER, name: '' }))
  ok(noName.status === 400, `setup insists on a name (got ${noName.status})`)
  const badEmail = await get('/auth/setup', jsonInit({ ...OWNER, email: 'not-an-email' }))
  ok(badEmail.status === 400, `and on a real address (got ${badEmail.status})`)
  const shortPassword = await get('/auth/setup', jsonInit({ ...OWNER, password: 'short' }))
  ok(shortPassword.status === 400, `and on a long enough password (got ${shortPassword.status})`)

  const created = await get('/auth/setup', jsonInit(OWNER))
  ok(created.status === 200, `first-run setup creates the owner (got ${created.status})`)
  const owner = (await created.json()).member
  ok(owner.role === 'owner' && owner.email === OWNER.email,
     `who is an owner with the address given (${owner.role}, ${owner.email})`)

  const again = await get('/auth/setup', jsonInit({ ...OWNER, email: 'someone-else@example.com' }))
  ok(again.status === 403, `and the window shuts behind it (got ${again.status})`)

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

  /* An agreement sent with no rate and no charges. It used to be stored
     exactly as written: a unit let at nothing, with nothing billed for
     it, and no sign on any screen that anything was wrong. The property
     is what it costs, so the property is what the bill comes from. */
  const priced = portfolio.properties.find((p) => p.id !== property.id && p.status === 'available')
  if (priced) {
    const nights = 4
    const from = plusDays(today, 30)
    const to = plusDays(from, nights)
    const free = {
      id: `b-free-${stamp}`, reference: `FREE-${stamp}`, propertyId: priced.id,
      clientId: client.id, mode: priced.mode === 'rental' ? 'long_term' : priced.mode,
      status: 'upcoming', start: from, end: to,
      rate: 0, deposit: 0, advanceMonths: 0, paidThrough: null, noticeDays: 0,
      guests: 2, source: 'direct', checkIn: '15:00', checkOut: '11:00',
      notes: '', createdAt: today,
    }
    const billed = await get('/bookings', json({ booking: free, invoices: [] })).then((r) => r.json())
    const stored = billed.bookings?.find((b) => b.id === free.id)
    ok(stored?.rate === priced.price,
       `an agreement with no rate takes the property's (${stored?.rate} vs ${priced.price})`)
    ok((stored?.deposit ?? 0) > 0, `and a deposit proportional to it (${stored?.deposit})`)

    const raised = (billed.invoices ?? []).filter((i) => i.bookingId === free.id)
    ok(raised.length >= 2, `charges are raised rather than none at all (${raised.length})`)
    const rent = raised.find((i) => i.type !== 'deposit')
    const expected = free.mode === 'short_stay' ? priced.price * nights : priced.price
    ok(rent?.amount === expected,
       `and the amount is the property's price (${rent?.amount} vs ${expected})`)

    await get(`/bookings/${free.id}`, { method: 'DELETE' })
  }
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

  /* ------------------------- arriving and leaving -------------------- *
   * The two moments the business turns on, and until now there was no
   * way to record either — an agreement went from upcoming to running by
   * the calendar alone, and ending one was the only way to close it.
   * ------------------------------------------------------------------- */
  const arrivedOn = plusDays(today, -1)
  const notYet = await get(`/bookings/${booking.id}/check-out`, json({ on: today }))
  ok(notYet.status === 409, `you cannot check out somebody who never arrived (got ${notYet.status})`)

  const arrived = await get(`/bookings/${booking.id}/check-in`, json({ on: arrivedOn }))
  ok(arrived.status === 200, `checking in is accepted (got ${arrived.status})`)
  const afterArrival = await arrived.json()
  const running = afterArrival.bookings.find((b) => b.id === booking.id)
  ok(running?.arrivedOn === arrivedOn,
     `and the day they actually came is what is stored (${running?.arrivedOn})`)
  ok(running?.status === 'in_progress', `the agreement is running (${running?.status})`)
  ok(afterArrival.properties.find((p) => p.id === property.id)?.status === 'occupied',
     'and the unit is held')

  const alreadyIn = await get(`/bookings/${booking.id}/check-in`, json({ on: today }))
  ok(alreadyIn.status === 409, `checking in twice is refused (got ${alreadyIn.status})`)

  const backwards = await get(`/bookings/${booking.id}/check-out`, json({ on: plusDays(arrivedOn, -3) }))
  ok(backwards.status === 409, `leaving before arriving is refused (got ${backwards.status})`)

  const leftOn = today
  const left = await get(`/bookings/${booking.id}/check-out`, json({ on: leftOn }))
  ok(left.status === 200, `checking out is accepted (got ${left.status})`)
  const afterDeparture = await left.json()
  const departed = afterDeparture.bookings.find((b) => b.id === booking.id)
  ok(departed?.departedOn === leftOn, `the departure date is stored (${departed?.departedOn})`)
  ok(departed?.status === 'completed', `the agreement is closed (${departed?.status})`)
  const freed = afterDeparture.properties.find((p) => p.id === property.id)
  ok(freed?.status === 'available' && freed?.availableFrom === leftOn,
     `and the unit is free from the day they went (${freed?.status}, ${freed?.availableFrom})`)
  ok(typeof afterDeparture.settled?.outstanding === 'number',
     `check-out says what is still owed (${afterDeparture.settled?.outstanding})`)

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

  /* ------------------------- seats and invitations ------------------- *
   * The subscription decides how many people can work here, and this is
   * the check that the number is counted where the rows are rather than
   * believed from the browser. The sample workspace is Professional: ten
   * seats, seven of them already taken by the seeded team.
   * ------------------------------------------------------------------- */
  const workspace = await get('/workspace').then((r) => r.json())
  ok(workspace.seats?.plan === 'professional' && workspace.seats?.limit === 10,
     `the plan and its seat count come back (${workspace.seats?.planLabel}, ${workspace.seats?.limit})`)
  const spent = workspace.seats.used
  ok(spent === portfolio.team.length,
     `every member of the team holds one (${spent} seats, ${portfolio.team.length} people)`)
  ok(workspace.seats.remaining === workspace.seats.limit - spent,
     `and what is left is the difference (${workspace.seats.remaining})`)

  const invitee = `invited-${stamp}@altier.co.ug`
  const invited = await get('/workspace/invitations', json({
    email: invitee, role: 'manager', title: 'Lettings',
  })).then((r) => r.json())
  ok(!!invited.link && invited.link.includes('/join/'),
     'inviting somebody hands back a link to pass on')
  ok(invited.seats.used === spent + 1,
     `a pending invitation holds a seat (${invited.seats.used} of ${invited.seats.limit})`)
  ok(invited.invitations.some((i) => i.email === invitee), 'and it is listed as outstanding')

  const twice = await get('/workspace/invitations', json({ email: invitee, role: 'staff' }))
  ok(twice.status === 409, `inviting the same address twice is refused (got ${twice.status})`)

  /* Fill the plan, then ask for one more. The refusal is a 402 rather
     than a 403: nothing is wrong, the workspace has simply run out. */
  const filler = []
  while (true) {
    const seats = await get('/workspace').then((r) => r.json())
    if (seats.seats.remaining === 0) break
    const email = `filler-${filler.length}-${stamp}@altier.co.ug`
    const res = await get('/workspace/invitations', json({ email, role: 'staff' }))
    if (res.status !== 200) { ok(false, `filling a seat answered ${res.status}`); break }
    filler.push((await res.json()).invitation.id)
  }
  const overLimit = await get('/workspace/invitations', json({
    email: `one-too-many-${stamp}@altier.co.ug`, role: 'staff',
  }))
  const refusal = await overLimit.json()
  ok(overLimit.status === 402, `a full plan refuses the next invitation as 402 (got ${overLimit.status})`)
  ok(refusal.upgrade === true && /Professional plan covers 10 seats/.test(refusal.error ?? ''),
     `and says what is full and what the next plan gives (${refusal.error})`)
  ok(refusal.seats?.used === refusal.seats?.limit, 'with the figures the prompt needs')

  const givenBack = await get(`/workspace/invitations/${filler.pop()}`, { method: 'DELETE' })
    .then((r) => r.json())
  ok(givenBack.seats.remaining === 1, 'withdrawing one gives the seat back')

  /* A tenant's portal login: free, and narrow. This walks it end to end,
     because the two ways it has broken were both invisible from the
     owner's side — a policy that handed a renter the other renters'
     charges, and one that closed a settings row the reader insisted on
     and answered the whole portfolio with a 500. */
  const tenantOf = stillThere.clients.find((c) => c.email && c.kind === 'tenant')
  if (tenantOf) {
    const before = await get('/workspace').then((r) => r.json())
    const portal = await get(`/clients/${tenantOf.id}/portal`, json({ password: TENANT_PASSWORD }))
    ok(portal.status === 200, `portal access opens for a tenant (got ${portal.status})`)
    const after = await get('/workspace').then((r) => r.json())
    ok(after.seats.used === before.seats.used,
       `and costs no seat (${before.seats.used} before, ${after.seats.used} after)`)
    ok(after.seats.tenants === before.seats.tenants + 1,
       `though it is counted as a portal login (${after.seats.tenants})`)

    /* What the owner can see of this tenant, to measure the portal against. */
    const ownerView = await get('/portfolio').then((r) => r.json())
    const theirBookings = ownerView.bookings.filter((b) => b.clientId === tenantOf.id).length
    const theirInvoices = ownerView.invoices.filter((i) => i.clientId === tenantOf.id).length

    const ownerHere = cookie
    cookie = ''
    const asTenant = await get('/auth/login', jsonInit({
      email: tenantOf.email, password: TENANT_PASSWORD,
    }))
    ok(asTenant.status === 200, `the tenant can sign in (got ${asTenant.status})`)
    ok((await asTenant.json()).member?.role === 'tenant', 'as a tenant, not as staff')

    const theirs = await get('/portfolio')
    ok(theirs.status === 200, `and their portfolio loads (got ${theirs.status})`)
    const portalView = await theirs.json()
    ok(portalView.bookings.length === theirBookings,
       `holding their agreements and no one else's (${portalView.bookings.length} of ${ownerView.bookings.length})`)
    ok(portalView.invoices.length === theirInvoices,
       `and their charges (${portalView.invoices.length} of ${ownerView.invoices.length})`)
    ok(portalView.bookings.every((b) => b.clientId === tenantOf.id)
       && portalView.invoices.every((i) => i.clientId === tenantOf.id),
       'every row of it with their name on')
    ok(portalView.team.length === 0 && portalView.maintenance.length === 0,
       `and neither the staff list nor the repair board (${portalView.team.length} staff, ${portalView.maintenance.length} jobs)`)

    const peek = await get('/workspace')
    ok(peek.status === 403, `a tenant cannot open Team & access (got ${peek.status})`)
    const meddle = await get('/team', jsonInit({
      id: 'om-evil', name: 'Mallory', role: 'owner', title: 'x',
      email: 'mallory@example.com', phone: 'x', since: today,
    }))
    ok(meddle.status === 403, `nor add themselves to the team (got ${meddle.status})`)

    cookie = ownerHere
    const closed = await get(`/clients/${tenantOf.id}/portal`, { method: 'DELETE' })
    ok(closed.status === 200, `and the owner can close it again (got ${closed.status})`)

    cookie = ''
    const afterClosing = await get('/auth/login', jsonInit({
      email: tenantOf.email, password: TENANT_PASSWORD,
    }))
    const stillIn = afterClosing.status === 200
      ? (await get('/portfolio')).status
      : afterClosing.status
    ok(stillIn === 403 || stillIn === 401,
       `after which that login reaches nothing (got ${stillIn})`)
    cookie = ownerHere
  }

  /* Accepting the invitation, in what is effectively another browser:
     the token is the whole credential, and it works once. */
  const ownerSession = cookie
  const joinToken = invited.link.split('/join/')[1]
  cookie = ''
  const onOffer = await get(`/auth/invitation/${joinToken}`).then((r) => r.json())
  ok(onOffer.invitation?.email === invitee && onOffer.invitation?.role === 'manager',
     'a stranger holding the link is told what it offers, and for whom')

  const joined = await get(`/auth/invitation/${joinToken}`, json({
    name: 'Invited Manager', password: 'a-perfectly-fine-password',
  }))
  ok(joined.status === 200, `accepting it creates the membership and signs them in (got ${joined.status})`)
  const joinedAs = (await joined.json()).member
  ok(joinedAs?.role === 'manager', `in the role they were invited to (${joinedAs?.role})`)

  const replay = await get(`/auth/invitation/${joinToken}`, json({
    name: 'Someone Else', password: 'another-fine-password',
  }))
  ok(replay.status === 409, `and the link cannot be used twice (got ${replay.status})`)

  cookie = ownerSession
  const afterJoining = await get('/workspace').then((r) => r.json())
  ok(!afterJoining.invitations.some((i) => i.email === invitee),
     'the accepted invitation is no longer outstanding')
  ok(afterJoining.seats.used === invited.seats.used + filler.length,
     `and the seat it held is now the seat they hold (${afterJoining.seats.used})`)

  for (const id of filler) await get(`/workspace/invitations/${id}`, { method: 'DELETE' })

  /* ---------------------- the roles are enforced --------------------- *
   * The matrix used to decide what the interface drew. This is the check
   * that it now decides what the server will do, which is the only place
   * it protects anything.
   * ------------------------------------------------------------------- */
  const ownerCookie = cookie
  const staff = portfolio.team.find((m) => m.role === 'staff')

  /* Two properties, chosen from the twenty-odd in the workspace. What
     comes back below is the test: not "fewer than everything" but exactly
     these, because the database is filtering on this list, not the API. */
  const assigned = portfolio.properties.slice(0, 2).map((p) => p.id)
  const withProperties = await get(`/team/${staff.id}`, put({ ...staff, propertyIds: assigned }))
    .then((r) => r.json())
  ok(
    (withProperties.team?.find((m) => m.id === staff.id)?.propertyIds ?? []).length === 2,
    'a staff member can be assigned properties',
  )

  await get(`/team/${staff.id}/password`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'staff-smoke-password' }),
  })
  const signedInAsStaff = await get('/auth/login', jsonInit({ email: staff.email, password: 'staff-smoke-password' }))
  ok(signedInAsStaff.status === 200, `a staff account signs in (got ${signedInAsStaff.status})`)

  const staffPortfolio = await get('/portfolio').then((r) => r.json())
  ok(staffPortfolio.invoices.length === 0,
     `staff receive no charges at all (got ${staffPortfolio.invoices.length}) — withheld, not hidden`)
  ok(
    staffPortfolio.properties.length === 2
    && staffPortfolio.properties.every((p) => assigned.includes(p.id)),
    `they receive the two properties they were assigned and no others `
    + `(got ${staffPortfolio.properties.length} of ${portfolio.properties.length})`,
  )
  ok(
    staffPortfolio.clients.length < portfolio.clients.length,
    `and only the clients holding those (${staffPortfolio.clients.length} of ${portfolio.clients.length})`,
  )

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
