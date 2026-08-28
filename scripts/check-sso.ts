/* ------------------------------------------------------------------ *
 * Single sign-on checks
 *
 * The identity token is the whole security boundary: everything after it
 * trusts what it says. So this exercises the verifier against tokens a
 * real attacker would send — unsigned, signed with the wrong algorithm,
 * signed by the wrong key, addressed to a different app, replayed from
 * an older flow — and insists each one is refused.
 *
 * Nothing here reaches the network. Google's and Apple's signing keys are
 * fetched over fetch(), so fetch() is what gets stubbed; the code under
 * test is the code that runs in production, unmodified.
 *
 *   npm run check:sso
 * ------------------------------------------------------------------ */

import { createSign, createVerify, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  SsoError, configuredProviders, exchangeCode, providerFor, verifyIdToken,
} from '../server/oidc.js'
import {
  LastWayIn, NotLinked, beginOauth, completeOauth, identitiesFor, profileForIdentity,
  setPassword, unlinkIdentity,
} from '../server/auth.js'
import { MEMORY, connect } from '../server/db/client.js'
import { createWorkspace } from '../server/workspace.js'
import { addMember, type Workspace } from '../server/mutations.js'
import * as t from '../server/db/schema.js'

/* Hermetic: this owns its database for the length of the run, and never
   touches whatever DATABASE_URL happens to point at. */
delete process.env.DATABASE_URL
process.env.PGLITE_PATH = MEMORY

let failures = 0
const ok = (label: string) => console.log(`  ok  ${label}`)
const fail = (label: string, detail: string) => {
  failures += 1
  console.error(`FAIL  ${label}\n      ${detail}`)
}

const check = (label: string, condition: boolean, detail = 'expected true') =>
  (condition ? ok(label) : fail(label, detail))

/** Asserts that a promise rejects, and that the reason mentions `because`. */
async function refuses(label: string, promise: Promise<unknown>, because: RegExp) {
  try {
    await promise
    fail(label, 'it was accepted')
  } catch (error) {
    const message = (error as Error).message
    if (error instanceof SsoError && because.test(message)) ok(label)
    else fail(label, `rejected, but with: ${message}`)
  }
}

/* --------------------------- a fake provider ----------------------- */

const CLIENT_ID = 'altier-test.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_ID = CLIENT_ID
process.env.GOOGLE_CLIENT_SECRET = 'test-secret'

const KID = 'test-key-1'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] }

/** Everything the token endpoint or the key endpoint would have said. */
let tokenResponse: { status: number; body: unknown } = { status: 200, body: {} }
let jwksFetches = 0
/** What the last exchange actually posted, so PKCE can be asserted on. */
let lastExchange: URLSearchParams | null = null

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes('/certs') || url.includes('/auth/keys')) {
    jwksFetches += 1
    return new Response(JSON.stringify(jwks), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  lastExchange = new URLSearchParams(String(init?.body ?? ''))
  return new Response(JSON.stringify(tokenResponse.body), {
    status: tokenResponse.status,
    headers: { 'content-type': 'application/json' },
  })
}) as typeof fetch

/* ----------------------------- token minting ----------------------- */

const b64u = (value: Buffer | string) =>
  Buffer.from(value as never).toString('base64url')
const part = (value: unknown) => b64u(Buffer.from(JSON.stringify(value)))

const now = () => Math.floor(Date.now() / 1000)

interface Overrides {
  header?: Record<string, unknown>
  claims?: Record<string, unknown>
  key?: KeyObject
  signature?: string
}

/** A token exactly as Google would mint it, unless told otherwise. */
function token(o: Overrides = {}): string {
  const header = { alg: 'RS256', kid: KID, typ: 'JWT', ...o.header }
  const claims = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '11223344556677889900',
    email: 'ronald@altier.co.ug',
    email_verified: true,
    name: 'Ronald Okello',
    iat: now(),
    exp: now() + 600,
    nonce: 'the-nonce',
    ...o.claims,
  }
  const signing = `${part(header)}.${part(claims)}`
  if (o.signature !== undefined) return `${signing}.${o.signature}`
  const signature = createSign('RSA-SHA256').update(signing).end().sign(o.key ?? privateKey)
  return `${signing}.${b64u(signature)}`
}

/* -------------------------------- run ------------------------------ */

async function main() {
  const google = providerFor('google')

  console.log('\nA well-formed token')
  const claims = await verifyIdToken(google, token(), 'the-nonce')
  check('the subject survives', claims.sub === '11223344556677889900', claims.sub)
  check('the email survives', claims.email === 'ronald@altier.co.ug', String(claims.email))
  check('it is marked verified', claims.emailVerified)
  check('it is not a relay address', !claims.privateRelay)

  console.log('\nClaims that change the answer')
  const unverified = await verifyIdToken(google, token({ claims: { email_verified: false } }), 'the-nonce')
  check('an unverified email says so', !unverified.emailVerified)
  const appleStyle = await verifyIdToken(google, token({ claims: { email_verified: 'true' } }), 'the-nonce')
  check('Apple\'s string "true" counts as verified', appleStyle.emailVerified)
  const relay = await verifyIdToken(
    google, token({ claims: { email: 'x7y9@privaterelay.appleid.com' } }), 'the-nonce')
  check('a relay address is recognised', relay.privateRelay)

  console.log('\nForgeries')
  await refuses(
    'an unsigned token is refused',
    verifyIdToken(google, token({ header: { alg: 'none' }, signature: '' }), 'the-nonce'),
    /signed in a way we do not accept/,
  )
  await refuses(
    'a symmetric algorithm is refused',
    verifyIdToken(google, token({ header: { alg: 'HS256' } }), 'the-nonce'),
    /signed in a way we do not accept/,
  )
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
  await refuses(
    'the wrong signing key is refused',
    verifyIdToken(google, token({ key: other.privateKey }), 'the-nonce'),
    /does not carry Google's signature/,
  )
  await refuses(
    'a key the provider does not publish is refused',
    verifyIdToken(google, token({ header: { kid: 'not-a-real-kid' } }), 'the-nonce'),
    /key it does not publish/,
  )

  /* A tampered payload with the original signature: the shape an attacker
     reaches for first, swapping the email for somebody else's. */
  const [head, , signature] = token().split('.')
  const swapped = `${head}.${part({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'x',
    email: 'owner@altier.co.ug', email_verified: true,
    iat: now(), exp: now() + 600, nonce: 'the-nonce',
  })}.${signature}`
  await refuses(
    'a swapped payload is refused',
    verifyIdToken(google, swapped, 'the-nonce'),
    /does not carry Google's signature/,
  )

  console.log('\nTokens that are genuine but not ours')
  await refuses(
    'the wrong issuer is refused',
    verifyIdToken(google, token({ claims: { iss: 'https://accounts.google.com.evil.test' } }), 'the-nonce'),
    /wrong issuer/,
  )
  await refuses(
    'a token for another app is refused',
    verifyIdToken(google, token({ claims: { aud: 'somebody-elses-client-id' } }), 'the-nonce'),
    /issued for a different app/,
  )
  await refuses(
    'an expired token is refused',
    verifyIdToken(google, token({ claims: { exp: now() - 3600, iat: now() - 7200 } }), 'the-nonce'),
    /took too long/,
  )
  await refuses(
    'a token from the future is refused',
    verifyIdToken(google, token({ claims: { iat: now() + 3600, exp: now() + 7200 } }), 'the-nonce'),
    /dated in the future/,
  )
  await refuses(
    'a replayed token from an older flow is refused',
    verifyIdToken(google, token({ claims: { nonce: 'a-nonce-from-some-other-sign-in' } }), 'the-nonce'),
    /did not match the one that was started/,
  )
  await refuses(
    'a token identifying nobody is refused',
    verifyIdToken(google, token({ claims: { sub: '' } }), 'the-nonce'),
    /identifies nobody/,
  )
  await refuses(
    'something that is not a token at all is refused',
    verifyIdToken(google, 'definitely-not-a-jwt', 'the-nonce'),
    /was not a token/,
  )

  console.log('\nThe signing keys are cached, not refetched per sign-in')
  const before = jwksFetches
  await verifyIdToken(google, token(), 'the-nonce')
  await verifyIdToken(google, token(), 'the-nonce')
  check('two more sign-ins fetched no keys', jwksFetches === before, `${jwksFetches - before} fetches`)

  console.log('\nThe token exchange')
  tokenResponse = { status: 400, body: { error: 'redirect_uri_mismatch' } }
  await refuses(
    'the provider\'s own reason is passed through',
    exchangeCode(google, 'a-code', 'https://altier.example/api/auth/oauth/google/callback', 'v'),
    /redirect_uri_mismatch/,
  )
  tokenResponse = { status: 200, body: { access_token: 'a' } }
  await refuses(
    'a response with no identity token is refused',
    exchangeCode(google, 'a-code', 'https://altier.example/api/auth/oauth/google/callback', 'v'),
    /refused the sign-in/,
  )

  console.log('\nApple\'s client secret')
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  process.env.APPLE_CLIENT_ID = 'co.ug.altier.web'
  process.env.APPLE_TEAM_ID = 'ABCDE12345'
  process.env.APPLE_KEY_ID = 'KEYID67890'
  /* Deliberately the shape a pasted environment variable really has:
     escaped newlines rather than real ones. */
  process.env.APPLE_PRIVATE_KEY = ec.privateKey
    .export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n')

  const apple = providerFor('apple')
  const secret = apple.clientSecret()
  const [sHead, sBody, sSig] = secret.split('.')
  const header = JSON.parse(Buffer.from(sHead, 'base64url').toString()) as Record<string, string>
  const payload = JSON.parse(Buffer.from(sBody, 'base64url').toString()) as Record<string, string | number>
  check('it is an ES256 assertion', header.alg === 'ES256', String(header.alg))
  check('it names the key', header.kid === 'KEYID67890', String(header.kid))
  check('the team is the issuer', payload.iss === 'ABCDE12345', String(payload.iss))
  check('the services id is the subject', payload.sub === 'co.ug.altier.web', String(payload.sub))
  check('it is addressed to Apple', payload.aud === 'https://appleid.apple.com', String(payload.aud))
  check('it expires', Number(payload.exp) > now() && Number(payload.exp) <= now() + 900, String(payload.exp))

  /* The signature must verify against the public half, in the raw r‖s
     encoding JWS requires — Node's default DER encoding would not. */
  const signatureValid = createVerify('SHA256')
    .update(`${sHead}.${sBody}`).end()
    .verify(
      { key: ec.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sSig, 'base64url'),
    )
  check('it verifies against the developer key', signatureValid)

  console.log('\nWhat is on offer')
  delete process.env.APPLE_CLIENT_ID
  check(
    'a half-configured provider is not offered',
    !configuredProviders().some((p) => p.id === 'apple'),
    JSON.stringify(configuredProviders()),
  )
  await refuses(
    'and starting it is refused outright',
    Promise.resolve().then(() => providerFor('apple')),
    /not set up on this deployment/,
  )
  await refuses(
    'an unknown provider is refused',
    Promise.resolve().then(() => providerFor('microsoft')),
    /not one this app offers/,
  )

  /* ------------------------------------------------------------------ *
   * The whole flow, against a real database
   *
   * Everything above tests a token in isolation. This runs the two legs
   * as the server runs them — state minted and stored, callback matched
   * back to it, identity resolved to a team member — with only the
   * provider's HTTP replaced. It is the closest thing to a sign-in that
   * does not involve a browser.
   * ------------------------------------------------------------------ */
  console.log('\nA sign-in, end to end')
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
  const { db, migrate, close } = await connect()
  await migrate()

  const REDIRECT = 'https://altier.example/api/auth/oauth/google/callback'

  /* An initialised database has nobody in it, exactly as a real one does,
     so the people this section needs are created here rather than
     borrowed from sample data that production never has. */
  const owner = {
    id: 'om-sso-owner', name: 'Nakato Owner', role: 'owner' as const, title: 'Owner',
    email: 'nakato@altier.co.ug', phone: '', since: '2026-01-01',
  }
  const colleague = {
    id: 'om-sso-staff', name: 'Brian Kizito', role: 'staff' as const, title: 'Caretaker',
    email: 'brian.kizito@altier.co.ug', phone: '', since: '2026-01-01',
  }
  /* A workspace with one owner in it, exactly as first run produces, and
     then a colleague added into it the way an owner would. */
  await db.insert(t.profiles).values({
    id: 'pr-sso-owner', name: owner.name, email: owner.email,
  })
  const { organizationId, memberId } = await createWorkspace(db, {
    organizationName: 'SSO check',
    profileId: 'pr-sso-owner',
    name: owner.name,
  })
  owner.id = memberId
  const ownerProfile = 'pr-sso-owner'
  const w: Workspace = { organizationId, memberId, name: owner.name, timezone: 'Africa/Kampala' }
  await addMember(db, w, colleague)

  /** Walks the flow to the point where the provider would answer. */
  const signIn = async (over: Overrides['claims'] = {}) => {
    const { url, browserSecret } = await beginOauth(db, 'google', REDIRECT)
    const state = new URL(url).searchParams.get('state') ?? ''
    const [row] = await db.select().from(t.oauthStates)
    tokenResponse = { status: 200, body: { id_token: token({ claims: { nonce: row.nonce, ...over } }) } }
    return { state, browserSecret }
  }

  const first = await signIn({ email: owner.email })
  const resolved = await completeOauth(db, 'google', first.state, 'the-code', first.browserSecret)
  const linked = await profileForIdentity(db, 'google', resolved)
  check('a verified address finds the account it belongs to', linked.id === ownerProfile, linked.id)
  check(
    'the exchange carried the PKCE verifier',
    (lastExchange?.get('code_verifier') ?? '').length > 20,
    String(lastExchange?.get('code_verifier')),
  )
  check(
    'and the state row is gone once used',
    (await db.select().from(t.oauthStates)).length === 0,
  )

  const links = await identitiesFor(db, ownerProfile)
  check('the link is recorded', links.length === 1 && links[0].provider === 'google', JSON.stringify(links))

  /* The subject is what the link is keyed on, so a person who later
     changes the address on their Google account keeps their access. */
  const moved = await signIn({ email: 'nakato.personal@gmail.com' })
  const again = await profileForIdentity(
    db, 'google',
    await completeOauth(db, 'google', moved.state, 'c', moved.browserSecret),
  )
  check('a changed provider address still signs the same person in', again.id === ownerProfile, again.id)
  check(
    'and does not create a second link',
    (await identitiesFor(db, ownerProfile)).length === 1,
  )

  console.log('\nWho is refused')
  const stranger = await signIn({ sub: 'a-different-google-account', email: 'mallory@example.com' })
  await refuses(
    'a verified account matching nobody cannot sign in',
    completeOauth(db, 'google', stranger.state, 'c', stranger.browserSecret)
      .then((c) => profileForIdentity(db, 'google', c)),
    /No Altier account uses mallory@example\.com/,
  )
  check(
    'and no account was created for them',
    (await db.select().from(t.profiles)).length === 2,
  )

  const unconfirmed = await signIn({ sub: 'yet-another', email: colleague.email, email_verified: false })
  await refuses(
    'an unverified address is refused even when it matches',
    completeOauth(db, 'google', unconfirmed.state, 'c', unconfirmed.browserSecret)
      .then((c) => profileForIdentity(db, 'google', c)),
    /did not confirm an email address/,
  )

  const hidden = await signIn({ sub: 'apple-ish', email: 'a1b2c3@privaterelay.appleid.com' })
  await refuses(
    'Apple\'s Hide My Email is refused with an explanation',
    completeOauth(db, 'google', hidden.state, 'c', hidden.browserSecret)
      .then((c) => profileForIdentity(db, 'google', c)),
    /Hide My Email/,
  )

  process.env.SSO_ALLOWED_DOMAINS = 'altier.co.ug'
  const outside = await signIn({ sub: 'outsider', email: 'someone@gmail.com' })
  await refuses(
    'an address outside the allowlist is refused',
    completeOauth(db, 'google', outside.state, 'c', outside.browserSecret)
      .then((c) => profileForIdentity(db, 'google', c)),
    /limited to altier\.co\.ug/,
  )
  delete process.env.SSO_ALLOWED_DOMAINS

  console.log('\nThe callback cannot be lied to')
  const started = await beginOauth(db, 'google', REDIRECT)
  const startedState = new URL(started.url).searchParams.get('state') ?? ''
  await refuses(
    'a state without the matching browser is refused',
    completeOauth(db, 'google', startedState, 'c', 'some-other-browsers-secret'),
    /started in a different browser/,
  )
  await refuses(
    'a state we never issued is refused',
    completeOauth(db, 'google', 'invented', 'c', started.browserSecret),
    /already been used, or has expired/,
  )
  /* The refused attempt above still consumed the row, which is the point:
     a state is spent on use, not on success. */
  await refuses(
    'and a spent state cannot be replayed',
    completeOauth(db, 'google', startedState, 'c', started.browserSecret),
    /already been used, or has expired/,
  )

  const stale = await beginOauth(db, 'google', REDIRECT)
  const staleState = new URL(stale.url).searchParams.get('state') ?? ''
  await db.update(t.oauthStates).set({ expiresAt: new Date(Date.now() - 1000) })
  await refuses(
    'an expired state is refused',
    completeOauth(db, 'google', staleState, 'c', stale.browserSecret),
    /took too long/,
  )

  console.log('\nUnlinking')
  /* Not an SsoError: the API turns this one into a 409 with the reason,
     which is a different answer from a failed sign-in. */
  const lastWayIn = await unlinkIdentity(db, { id: ownerProfile, passwordHash: null }, 'google')
    .then(() => null, (e: Error) => e)
  check(
    'the only way into an account cannot be removed',
    lastWayIn instanceof LastWayIn && /only way into this account/.test(lastWayIn.message),
    lastWayIn ? `${lastWayIn.constructor.name}: ${lastWayIn.message}` : 'it was removed',
  )

  await setPassword(db, ownerProfile, 'a-perfectly-fine-password')
  await unlinkIdentity(db, { id: ownerProfile, passwordHash: 'set' }, 'google')
  check('with a password set, it unlinks', (await identitiesFor(db, ownerProfile)).length === 0)
  check(
    'unlinking what is not linked is its own kind too',
    await unlinkIdentity(db, { id: ownerProfile, passwordHash: 'set' }, 'google')
      .then(() => false, (e) => e instanceof NotLinked),
  )

  console.log('\nRemoving a person takes their links with them')
  const relink = await signIn({ sub: 'link-me-again', email: owner.email })
  await profileForIdentity(db, 'google', await completeOauth(db, 'google', relink.state, 'c', relink.browserSecret))
  check('linked again', (await identitiesFor(db, ownerProfile)).length === 1)
  await db.delete(t.profiles).where(eq(t.profiles.id, ownerProfile))
  check(
    'and the link is gone with the account',
    (await db.select().from(t.identities)).length === 0,
  )

  await close()

  console.log(failures === 0 ? '\nALL SSO CHECKS PASS\n' : `\n${failures} SSO CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
