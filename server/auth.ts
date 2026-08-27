/* ------------------------------------------------------------------ *
 * Authentication
 *
 * Password verification, sessions, and the permission checks that make
 * the role matrix mean something. Until now roles decided what the
 * interface drew; here they decide what the server will do, which is
 * the only place the distinction matters.
 *
 * No dependencies beyond node:crypto. scrypt is a memory-hard key
 * derivation function built into Node, so there is no native module to
 * compile and nothing extra to trust.
 * ------------------------------------------------------------------ */

import {
  createHash, randomBytes, scrypt as scryptCb, timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { and, eq, lt, sql } from 'drizzle-orm'
import type { NextFunction, Request, Response } from 'express'
import { can, type Permission } from '../src/lib/rbac.js'
import type { Role, TeamMember } from '../src/lib/types.js'
import type { Db } from './db/client.js'
import {
  SsoError, authorizeUrl, exchangeCode, providerFor, verifyIdToken, type Claims,
} from './oidc.js'
import * as t from './db/schema.js'

const scrypt = promisify(scryptCb) as (
  password: string, salt: Buffer, keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/*
 * OWASP lists several equivalent scrypt settings; this is their N=2^15,
 * r=8, p=3 option, which needs 128·N·r ≈ 33 MB rather than the 134 MB of
 * the N=2^17 variant. That matters here: a serverless instance is memory
 * capped and handles concurrent logins, and Node's own scrypt refuses
 * anything over maxmem, which defaults to 32 MB — hence setting it.
 */
const SCRYPT = { N: 1 << 15, r: 8, p: 3 }
const MAXMEM = 64 * 1024 * 1024
const KEY_BYTES = 64

export const SESSION_COOKIE = 'altier_session'
const SESSION_DAYS = 14

/** Long enough that guessing is not a strategy. */
const TOKEN_BYTES = 32

/* Slow an attacker without locking a forgetful person out for long. */
const MAX_ATTEMPTS = 8
const LOCK_MINUTES = 15

/** Short enough to be memorable, long enough to be worth hashing. */
export const MIN_PASSWORD = 10

/* ----------------------------- passwords --------------------------- */

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(plain.normalize('NFKC'), salt, KEY_BYTES, { ...SCRYPT, maxmem: MAXMEM })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, N, r, p, salt, key] = stored.split('$')
  if (scheme !== 'scrypt') return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scrypt(
    plain.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: MAXMEM },
  )
  // Constant time: a comparison that returns early leaks the password.
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * Spends the same effort as a real verification, for the case where no
 * account matches. Without it, "no such email" returns far faster than a
 * wrong password and the difference enumerates who has an account.
 */
export async function equaliseTiming(password: string): Promise<void> {
  await scrypt(password.normalize('NFKC'), DECOY_SALT, KEY_BYTES, { ...SCRYPT, maxmem: MAXMEM })
}
const DECOY_SALT = Buffer.from('altier-timing-equalisation-salt!')

/** Why a password is unacceptable, or null if it will do. */
export function rejectPassword(password: string, member: { name: string; email: string }): string | null {
  const value = password.normalize('NFKC')
  if (value.length < MIN_PASSWORD) return `A password needs at least ${MIN_PASSWORD} characters.`
  if (value.length > 200) return 'That password is longer than 200 characters.'
  const lowered = value.toLowerCase()
  if (lowered === member.email.toLowerCase()) return 'A password cannot be your email address.'
  if (lowered === member.name.toLowerCase()) return 'A password cannot be your name.'
  if (/^(.)\1+$/.test(value)) return 'A password cannot be one character repeated.'
  return null
}

/* ------------------------------ sessions --------------------------- */

/** The row holds this, never the token, so the table is not a key ring. */
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(db: Db, memberId: string, userAgent?: string) {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await db.insert(t.sessions).values({
    tokenHash: digest(token),
    memberId,
    expiresAt,
    userAgent: userAgent?.slice(0, 300) ?? null,
  })
  // Opportunistic sweep; expired rows are dead weight and a small risk.
  await db.delete(t.sessions).where(lt(t.sessions.expiresAt, new Date()))
  return { token, expiresAt }
}

export async function readSession(db: Db, token: string | undefined) {
  if (!token) return null
  const rows = await db.select({
    member: t.teamMembers,
    expiresAt: t.sessions.expiresAt,
  })
    .from(t.sessions)
    .innerJoin(t.teamMembers, eq(t.teamMembers.id, t.sessions.memberId))
    .where(eq(t.sessions.tokenHash, digest(token)))

  const row = rows[0]
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(t.sessions).where(eq(t.sessions.tokenHash, digest(token)))
    return null
  }
  await db.update(t.sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(t.sessions.tokenHash, digest(token)))
  return row.member
}

export const destroySession = (db: Db, token: string | undefined) =>
  token ? db.delete(t.sessions).where(eq(t.sessions.tokenHash, digest(token))) : Promise.resolve()

/** Signing out everywhere: what a password change should always do. */
export const destroyAllSessions = (db: Db, memberId: string) =>
  db.delete(t.sessions).where(eq(t.sessions.memberId, memberId))

/* ------------------------------ throttle --------------------------- */

export const lockedFor = (member: { lockedUntil: Date | null }) => {
  if (!member.lockedUntil) return 0
  return Math.max(0, Math.ceil((member.lockedUntil.getTime() - Date.now()) / 60_000))
}

export async function recordFailure(db: Db, memberId: string, attempts: number) {
  const next = attempts + 1
  await db.update(t.teamMembers).set({
    failedAttempts: next,
    lockedUntil: next >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
  }).where(eq(t.teamMembers.id, memberId))
}

export const clearFailures = (db: Db, memberId: string) =>
  db.update(t.teamMembers)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(t.teamMembers.id, memberId))

/* ------------------------------- cookie ---------------------------- */

/* Secure is omitted on plain HTTP so a local dev server still works; every
   deployment of this app is HTTPS, where it is set. */
const secure = () => process.env.NODE_ENV === 'production' || !!process.env.VERCEL

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    expires: expiresAt,
    path: '/',
  })
}

export const clearSessionCookie = (res: Response) =>
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/' })

/**
 * The cookie that ties an in-flight sign-in to this browser.
 *
 * Apple answers the flow with a cross-site form POST, and a Lax cookie is
 * not sent on one — so that provider needs SameSite=None, which browsers
 * only honour alongside Secure. Apple requires an HTTPS redirect anyway,
 * so the pair always holds. Google's plain redirect keeps Lax.
 */
export function setOauthCookie(res: Response, secret: string, crossSite: boolean) {
  res.cookie(OAUTH_COOKIE, secret, {
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    secure: crossSite || secure(),
    maxAge: OAUTH_WINDOW_MS,
    path: '/api/auth',
  })
}

/* Cleared with the same attributes it was set with, or the browser keeps
   it: a cookie is identified by name, domain and path together. */
export function clearOauthCookie(res: Response, crossSite: boolean) {
  res.clearCookie(OAUTH_COOKIE, {
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    secure: crossSite || secure(),
    path: '/api/auth',
  })
}

/* ---------------------------- the gate ----------------------------- */

export class Unauthorized extends Error {}
export class Forbidden extends Error {}

/** The signed-in member, attached by the middleware below. */
export interface Authed extends Request {
  member?: TeamMember & { passwordHash: string | null }
}

/**
 * Attaches the session's member to the request, or nothing. Reading is
 * separate from requiring so that the login and setup routes can see who
 * is asking without demanding that anybody be signed in.
 */
export const attachMember = (db: Db) =>
  (req: Authed, _res: Response, next: NextFunction) => {
    readSession(db, req.cookies?.[SESSION_COOKIE] as string | undefined)
      .then((member) => { req.member = member ?? undefined; next() })
      .catch(next)
  }

export function requireMember(req: Authed) {
  if (!req.member) throw new Unauthorized('Sign in to continue.')
  return req.member
}

/**
 * The whole point of this file: a permission the role does not hold is
 * refused here, not merely hidden in the interface. A staff account can
 * open devtools and call the API directly; this is what stops it.
 */
export const requirePermission = (permission: Permission) =>
  (req: Authed, _res: Response, next: NextFunction) => {
    try {
      const member = requireMember(req)
      if (!can(member.role as Role, permission)) {
        throw new Forbidden(`Your role does not allow this (${permission}).`)
      }
      next()
    } catch (error) {
      next(error)
    }
  }

/** True while nobody can sign in — the only window the setup route opens. */
export async function noAccountsYet(db: Db) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(t.teamMembers)
    .where(sql`${t.teamMembers.passwordHash} IS NOT NULL`)
  return (row?.n ?? 0) === 0
}

export async function findByEmail(db: Db, email: string) {
  const rows = await db.select().from(t.teamMembers)
    .where(and(sql`lower(${t.teamMembers.email}) = ${email.trim().toLowerCase()}`))
  return rows[0] ?? null
}

export async function setPassword(db: Db, memberId: string, password: string) {
  await db.update(t.teamMembers).set({
    passwordHash: await hashPassword(password),
    passwordSetAt: new Date(),
    failedAttempts: 0,
    lockedUntil: null,
  }).where(eq(t.teamMembers.id, memberId))
}

/* ---------------------- Google and Apple sign-in ------------------- *
 * The protocol lives in oidc.ts; the policy lives here. The policy is
 * one sentence: a provider says who is at the keyboard, and a team
 * member an owner already created says whether that person belongs.
 * ------------------------------------------------------------------- */

/** Ten minutes is generous for a redirect and short for a stolen state. */
const OAUTH_WINDOW_MS = 10 * 60 * 1000
export const OAUTH_COOKIE = 'altier_oauth'

/**
 * Starts a sign-in: mints the one-time parameters, records them, and
 * returns the provider URL to send the browser to.
 *
 * The state row is in the database rather than in memory because the
 * instance that begins the flow is rarely the one that finishes it — on
 * a serverless host they are different processes on different machines.
 */
export async function beginOauth(db: Db, providerId: string, redirectUri: string) {
  const provider = providerFor(providerId)
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(16).toString('base64url')
  const browserSecret = randomBytes(32).toString('base64url')
  const verifier = provider.pkce ? randomBytes(32).toString('base64url') : null

  await db.delete(t.oauthStates).where(lt(t.oauthStates.expiresAt, new Date()))
  await db.insert(t.oauthStates).values({
    stateHash: digest(state),
    provider: provider.id,
    verifier,
    nonce,
    browserHash: digest(browserSecret),
    redirectUri,
    expiresAt: new Date(Date.now() + OAUTH_WINDOW_MS),
  })

  const challenge = verifier
    ? createHash('sha256').update(verifier).digest('base64url')
    : undefined

  return {
    browserSecret,
    crossSite: provider.responseMode === 'form_post',
    url: authorizeUrl(provider, { redirectUri, state, nonce, challenge }),
  }
}

/**
 * Finishes a sign-in. Everything that can go wrong here is a refusal
 * rather than a fallback: a flow that cannot be tied back to the one we
 * started is not a flow we finish.
 */
export async function completeOauth(
  db: Db, providerId: string, state: string, code: string, browserSecret: string | undefined,
) {
  const provider = providerFor(providerId)

  /* Single use. Deleting first means a replayed callback finds nothing,
     which is the behaviour we want even if the rest of this throws. */
  const [row] = await db.delete(t.oauthStates)
    .where(eq(t.oauthStates.stateHash, digest(state || 'none')))
    .returning()
  if (!row) throw new SsoError('That sign-in link has already been used, or has expired. Start again.')
  if (row.expiresAt.getTime() < Date.now()) throw new SsoError('That sign-in took too long. Start again.')
  if (row.provider !== provider.id) throw new SsoError('That sign-in came back to the wrong place.')

  /* Ties the callback to the browser that began it. Without this, an
     attacker could start a flow, hand somebody else the resulting link,
     and have them land signed in as the attacker. */
  if (!browserSecret || digest(browserSecret) !== row.browserHash) {
    throw new SsoError('That sign-in was started in a different browser. Start again here.')
  }

  const idToken = await exchangeCode(provider, code, row.redirectUri, row.verifier)
  return verifyIdToken(provider, idToken, row.nonce)
}

/**
 * Turns a verified identity into a team member, or refuses.
 *
 * The order matters. An already-linked account signs in on the strength
 * of the subject alone, so a person who later changes their Google
 * address keeps their access. An unlinked one has to match a member by
 * verified email, and that is the only way a link is ever created.
 */
export async function memberForIdentity(db: Db, providerId: string, claims: Claims) {
  const provider = providerFor(providerId)

  const [existing] = await db.select({ memberId: t.identities.memberId })
    .from(t.identities)
    .where(and(eq(t.identities.provider, provider.id), eq(t.identities.subject, claims.sub)))

  if (existing) {
    const [member] = await db.select().from(t.teamMembers).where(eq(t.teamMembers.id, existing.memberId))
    if (!member) throw new SsoError('The account that link belonged to has been removed.')
    await db.update(t.identities)
      .set({ lastUsedAt: new Date(), email: claims.email ?? null })
      .where(and(eq(t.identities.provider, provider.id), eq(t.identities.subject, claims.sub)))
    return member
  }

  /* First time. From here on the email is doing the work, so it has to be
     one the provider vouches for. */
  if (!claims.email || !claims.emailVerified) {
    throw new SsoError(`${provider.label} did not confirm an email address for that account, so it cannot be matched to anybody here.`)
  }
  if (claims.privateRelay) {
    throw new SsoError('That used Apple\'s "Hide My Email". Choose "Share My Email" so Altier can match you to your team account.')
  }

  const allowed = allowedDomains()
  const domain = claims.email.split('@').pop()?.toLowerCase() ?? ''
  if (allowed.length && !allowed.includes(domain)) {
    throw new SsoError(`Single sign-on on this deployment is limited to ${allowed.join(', ')}.`)
  }

  const member = await findByEmail(db, claims.email)
  if (!member) {
    /* Deliberately explicit rather than vague. This is not a login form
       an attacker probes for valid addresses — reaching it costs a real
       Google or Apple account — and a person locked out by a typo in
       their address deserves to know that is what happened. */
    throw new SsoError(`No Altier team member uses ${claims.email}. Ask an owner to add that address to your account first.`)
  }

  await db.insert(t.identities).values({
    provider: provider.id,
    subject: claims.sub,
    memberId: member.id,
    email: claims.email,
    lastUsedAt: new Date(),
  })
  return member
}

/** Optional: restrict linking to addresses at your own domains. */
const allowedDomains = () =>
  (process.env.SSO_ALLOWED_DOMAINS ?? '')
    .split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)

export const identitiesFor = (db: Db, memberId: string) =>
  db.select({
    provider: t.identities.provider,
    email: t.identities.email,
    linkedAt: t.identities.linkedAt,
    lastUsedAt: t.identities.lastUsedAt,
  }).from(t.identities).where(eq(t.identities.memberId, memberId))

/**
 * Unlinking. Refused when it would be the last way in — an account with
 * no password and no remaining link is one nobody can open, including
 * the person doing the unlinking.
 */
export async function unlinkIdentity(db: Db, member: { id: string; passwordHash: string | null }, providerId: string) {
  const links = await identitiesFor(db, member.id)
  if (!links.some((l) => l.provider === providerId)) {
    throw new NotLinked('That account is not linked.')
  }
  if (!member.passwordHash && links.length === 1) {
    throw new LastWayIn('That is the only way into this account. Set a password first.')
  }
  await db.delete(t.identities)
    .where(and(eq(t.identities.provider, providerId as 'google' | 'apple'), eq(t.identities.memberId, member.id)))
}

export class NotLinked extends Error {}
export class LastWayIn extends Error {}
