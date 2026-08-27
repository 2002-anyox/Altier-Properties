/* ------------------------------------------------------------------ *
 * Google and Apple sign-in
 *
 * The OpenID Connect authorization-code flow, written against the two
 * providers directly rather than through a framework. That is a
 * deliberate trade: the flow is about a hundred lines of protocol, and
 * an auth library is a dependency that gets to see every credential.
 *
 * The one rule that governs everything here: a provider proves *who is
 * at the keyboard*, never *who belongs in this portfolio*. Anybody can
 * get a Google account, so a verified identity is only ever matched
 * against a team member an owner already created. There is no path
 * through this file that adds a person — see linkIdentity in auth.ts.
 *
 * No dependencies beyond node:crypto and fetch.
 * ------------------------------------------------------------------ */

import { createPrivateKey, createPublicKey, createSign, createVerify } from 'node:crypto'

/** A sign-in that failed for a reason the person can act on. */
export class SsoError extends Error {}

export type ProviderId = 'google' | 'apple'

interface Provider {
  id: ProviderId
  label: string
  issuer: string
  authorizeUrl: string
  tokenUrl: string
  jwksUrl: string
  scope: string
  /** Apple answers with a POST, because it returns the name and email. */
  responseMode?: 'form_post'
  /** Google takes a PKCE challenge; Apple's flow is protected by its
   *  client secret, which is a signed assertion rather than a shared one. */
  pkce: boolean
  clientId: () => string
  clientSecret: () => string
  configured: () => boolean
  /** Extra parameters this provider wants on the authorize URL. */
  extra?: Record<string, string>
}

const env = (name: string) => process.env[name]?.trim() ?? ''

/* Endpoints are hard-coded rather than discovered. Both providers publish
   a discovery document, but fetching it adds a network round trip and a
   failure mode to every sign-in, and these five URLs have been stable for
   years. The signing keys are fetched — those genuinely do rotate. */

const GOOGLE: Provider = {
  id: 'google',
  label: 'Google',
  issuer: 'https://accounts.google.com',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  scope: 'openid email profile',
  pkce: true,
  clientId: () => env('GOOGLE_CLIENT_ID'),
  clientSecret: () => env('GOOGLE_CLIENT_SECRET'),
  configured: () => !!env('GOOGLE_CLIENT_ID') && !!env('GOOGLE_CLIENT_SECRET'),
  /* Ask for an account every time rather than silently reusing whichever
     one the browser is already signed into — on a shared office machine
     the silent one is usually the wrong one. */
  extra: { prompt: 'select_account' },
}

const APPLE: Provider = {
  id: 'apple',
  label: 'Apple',
  issuer: 'https://appleid.apple.com',
  authorizeUrl: 'https://appleid.apple.com/auth/authorize',
  tokenUrl: 'https://appleid.apple.com/auth/token',
  jwksUrl: 'https://appleid.apple.com/auth/keys',
  scope: 'name email',
  responseMode: 'form_post',
  pkce: false,
  clientId: () => env('APPLE_CLIENT_ID'),
  clientSecret: () => appleClientSecret(),
  configured: () =>
    !!env('APPLE_CLIENT_ID') && !!env('APPLE_TEAM_ID')
    && !!env('APPLE_KEY_ID') && !!env('APPLE_PRIVATE_KEY'),
}

const PROVIDERS: Record<ProviderId, Provider> = { google: GOOGLE, apple: APPLE }

export const providerFor = (id: string): Provider => {
  const p = PROVIDERS[id as ProviderId]
  if (!p) throw new SsoError('That sign-in method is not one this app offers.')
  if (!p.configured()) throw new SsoError(`${p.label} sign-in is not set up on this deployment.`)
  return p
}

/** What the sign-in screen should offer: only what is actually wired up. */
export const configuredProviders = () =>
  Object.values(PROVIDERS)
    .filter((p) => p.configured())
    .map((p) => ({ id: p.id, label: p.label }))


/* ------------------------------ base64url -------------------------- */

const b64u = (b: Buffer) => b.toString('base64url')
const unb64u = (s: string) => Buffer.from(s, 'base64url')
const jsonPart = (part: string) => JSON.parse(unb64u(part).toString('utf8')) as Record<string, unknown>

/* --------------------------- Apple's secret ------------------------ */

/**
 * Apple does not issue a client secret. You sign one: a short-lived ES256
 * assertion proving you hold the private key from the developer portal.
 * It is regenerated per exchange, so there is nothing long-lived to leak
 * and nothing to rotate when it expires.
 */
function appleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: env('APPLE_KEY_ID'), typ: 'JWT' }
  const payload = {
    iss: env('APPLE_TEAM_ID'),
    iat: now,
    exp: now + 600,
    aud: 'https://appleid.apple.com',
    sub: env('APPLE_CLIENT_ID'),
  }
  const signing = `${b64u(Buffer.from(JSON.stringify(header)))}.${b64u(Buffer.from(JSON.stringify(payload)))}`
  const signature = createSign('SHA256')
    .update(signing).end()
    /* JWS wants the raw r‖s pair; the default DER encoding is rejected. */
    .sign({ key: createPrivateKey(applePrivateKey()), dsaEncoding: 'ieee-p1363' })
  return `${signing}.${b64u(signature)}`
}

/**
 * The .p8 file, however it survived being pasted into an environment
 * variable: with real newlines, with them escaped, or as bare base64 with
 * the PEM envelope stripped off.
 */
function applePrivateKey(): string {
  const raw = env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n').trim()
  if (raw.includes('BEGIN')) return raw
  const body = raw.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? ''
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`
}

/* --------------------------- the authorize leg --------------------- */

export interface StartOptions {
  redirectUri: string
  state: string
  nonce: string
  /** The PKCE challenge, already derived from the verifier. */
  challenge?: string
}

export function authorizeUrl(p: Provider, o: StartOptions): string {
  const url = new URL(p.authorizeUrl)
  const params: Record<string, string> = {
    client_id: p.clientId(),
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: p.scope,
    state: o.state,
    nonce: o.nonce,
    ...p.extra,
  }
  if (p.responseMode) params.response_mode = p.responseMode
  if (p.pkce && o.challenge) {
    params.code_challenge = o.challenge
    params.code_challenge_method = 'S256'
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

/* ----------------------------- the token leg ----------------------- */

interface TokenResponse { id_token?: string; error?: string; error_description?: string }

export async function exchangeCode(
  p: Provider, code: string, redirectUri: string, verifier: string | null,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: p.clientId(),
    client_secret: p.clientSecret(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  if (verifier) body.set('code_verifier', verifier)

  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  const payload = await res.json().catch(() => null) as TokenResponse | null
  if (!res.ok || !payload?.id_token) {
    /* The provider's own wording is the useful part here — "redirect_uri
       mismatch" is the difference between a bug and a typo in a console. */
    const detail = payload?.error_description || payload?.error || `HTTP ${res.status}`
    throw new SsoError(`${p.label} refused the sign-in: ${detail}`)
  }
  return payload.id_token
}

/* --------------------------- verifying the token ------------------- */

/* We only read the key id; createPublicKey understands the rest. */
interface Jwk { kid?: string; kty?: string; n?: string; e?: string; [field: string]: unknown }
interface Jwks { keys: Jwk[] }

const jwksCache = new Map<ProviderId, { at: number; jwks: Jwks }>()
const JWKS_TTL_MS = 60 * 60 * 1000

async function signingKey(p: Provider, kid: string) {
  const cached = jwksCache.get(p.id)
  const fresh = cached && Date.now() - cached.at < JWKS_TTL_MS
  const found = fresh ? cached.jwks.keys.find((k) => k.kid === kid) : undefined
  if (found) return found

  /* A cache miss is the normal signal that keys rotated, so refetch —
     but only once per token, or an unknown kid becomes a way to make this
     server hammer the provider. */
  const res = await fetch(p.jwksUrl, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new SsoError(`Could not reach ${p.label} to check the signature.`)
  const jwks = await res.json() as Jwks
  jwksCache.set(p.id, { at: Date.now(), jwks })

  const key = jwks.keys.find((k) => k.kid === kid)
  if (!key) throw new SsoError(`${p.label} signed that with a key it does not publish.`)
  return key
}

export interface Claims {
  sub: string
  email?: string
  emailVerified: boolean
  name?: string
  /** Apple's per-app relay address, which will never match a team member. */
  privateRelay: boolean
}

/** Sixty seconds either way, for clocks that disagree slightly. */
const SKEW_MS = 60_000

export async function verifyIdToken(p: Provider, raw: string, nonce: string): Promise<Claims> {
  const parts = raw.split('.')
  if (parts.length !== 3) throw new SsoError('That sign-in response was not a token.')
  const [head, body, signature] = parts

  const header = jsonPart(head)
  /* Pinning the algorithm is what stops the classic forgeries: "alg":
     "none", and an HMAC signed with the public key we are about to look
     up. Both providers use RS256 and nothing else. */
  if (header.alg !== 'RS256') throw new SsoError('That token was signed in a way we do not accept.')

  const jwk = await signingKey(p, String(header.kid ?? ''))
  const verified = createVerify('RSA-SHA256')
    .update(`${head}.${body}`).end()
    .verify(createPublicKey({ key: jwk, format: 'jwk' }), unb64u(signature))
  if (!verified) throw new SsoError(`That token does not carry ${p.label}'s signature.`)

  const claims = jsonPart(body)
  if (claims.iss !== p.issuer) throw new SsoError('That token came from the wrong issuer.')

  const audience = Array.isArray(claims.aud) ? claims.aud as string[] : [claims.aud as string]
  if (!audience.includes(p.clientId())) throw new SsoError('That token was issued for a different app.')

  const exp = Number(claims.exp) * 1000
  if (!Number.isFinite(exp) || exp < Date.now() - SKEW_MS) throw new SsoError('That sign-in took too long. Try again.')
  const iat = Number(claims.iat) * 1000
  if (Number.isFinite(iat) && iat > Date.now() + SKEW_MS) throw new SsoError('That token is dated in the future.')

  /* The nonce ties this token to the authorize request we started, so a
     token minted for some other site cannot be replayed into this one. */
  if (claims.nonce !== nonce) throw new SsoError('That sign-in did not match the one that was started.')

  const sub = String(claims.sub ?? '')
  if (!sub) throw new SsoError('That token identifies nobody.')

  const email = typeof claims.email === 'string' ? claims.email : undefined
  /* Apple sends the flag as the string "true"; Google as a boolean. */
  const verifiedFlag = claims.email_verified
  return {
    sub,
    email,
    emailVerified: verifiedFlag === true || verifiedFlag === 'true',
    name: typeof claims.name === 'string' ? claims.name : undefined,
    privateRelay: !!email && /@privaterelay\.appleid\.com$/i.test(email),
  }
}
