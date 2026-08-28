/* ------------------------------------------------------------------ *
 * HTTP API
 *
 * One bootstrap endpoint returns the whole portfolio — at this size the
 * dataset is kilobytes, so the client holds it and every selector keeps
 * working over plain arrays. Each mutation returns the refreshed
 * portfolio, so the client and the database cannot drift.
 *
 * The app is built by a factory rather than at module scope so it can be
 * mounted two ways: a long-running process locally (server/serve.ts,
 * `npm run api`) and a serverless function in production (api/index.ts).
 * ------------------------------------------------------------------ */

import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { and, eq, sql } from 'drizzle-orm'
import { connect, type Db } from './db/client.js'
import { organizationMembers, organizations, profiles, properties, subscriptions } from './db/schema.js'
import { readPortfolio } from './db/read.js'
import { missingMigrations } from './db/applied.js'
import { classify, explain, rootCause } from './db/fault.js'
import {
  Conflict, NotFound, addBooking, addClient, addMaintenance, addMember, addNote,
  addProperty, checkIn, checkOut, deleteBooking, deleteClient, deleteMember, deleteProperty,
  grantPortalAccess, recordPayment, revokePortalAccess, sendReminder,
  setMaintenanceStatus, setPropertyStatus, updateBooking, updateClient, updateMember,
  updateProperty, updateReminders, type Workspace,
} from './mutations.js'
import type { Booking, Client, Invoice, Property, TeamMember } from '../src/lib/types.js'
import { ALL_PERMISSIONS, type Permission } from '../src/lib/rbac.js'
import {
  Forbidden, LastWayIn, NotLinked, OAUTH_COOKIE, MIN_PASSWORD,
  SESSION_COOKIE, Unauthorized,
  attachViewer, beginOauth, clearFailures, clearOauthCookie, clearSessionCookie,
  completeOauth, createSession, destroyAllSessions, destroySession, equaliseTiming, findByEmail,
  hashPassword, identitiesFor, lockedFor, noAccountsYet, profileForIdentity, recordFailure,
  rejectPassword, requireMembership, requirePermission, requireViewer, setOauthCookie,
  setPassword, setSessionCookie, unlinkIdentity, verifyPassword, type Authed, type Viewer,
} from './auth.js'
import { DEFAULT_TIMEZONE } from '../src/lib/defaults.js'
import { scoped } from './scope.js'
import {
  BadInvitation, NoSubscription, SeatLimit, createWorkspace, defaultOrganization,
  BadPermission, acceptInvitation, invitationByToken, inviteMember, membershipsFor,
  openInvitations, permissionMatrix, resetPermissions, revokeInvitation, seatUsage,
  setRolePermission,
} from './workspace.js'
import { SsoError, configuredProviders } from './oidc.js'

/**
 * What the client is allowed to know about the person signed in. Never the
 * hash, and never anything about a workspace they are not looking at.
 *
 * The identifier is the membership's, not the profile's, because that is
 * what the rest of the portfolio refers to — a property names the
 * membership that manages it.
 */
const publicMember = (viewer: Viewer) => {
  const { profile, membership } = viewer
  return {
    id: membership?.id ?? profile.id,
    name: profile.name,
    role: membership?.role ?? null,
    title: membership?.title ?? '',
    email: profile.email,
    phone: profile.phone,
    since: membership?.since ?? profile.createdAt.toISOString().slice(0, 10),
    isSuperAdmin: profile.isSuperAdmin,
  }
}

export function createApp(db: Db, driver: string) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '256kb' }))
  /* Apple answers the sign-in flow with a form POST rather than a query
     string, because it also returns the person's name. Nothing else here
     is form-encoded, hence the small limit. */
  app.use(express.urlencoded({ extended: false, limit: '16kb' }))

  app.use(cookieParser())

  /* Routes are registered under /api because that is what the browser asks
     for. A serverless platform may strip the prefix before handing the
     request over, so put it back rather than depend on which one does. */
  app.use((req, _res, next) => {
    if (!req.url.startsWith('/api/') && req.url !== '/api') req.url = `/api${req.url}`
    next()
  })

  /** Wraps a handler so a rejected promise reaches the error middleware. */
  const route = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next) }

  /** Express types a route param as string | string[]; ours are always single. */
  const param = (req: Request, name: string) => String((req.params as Record<string, string>)[name])

  // Who is asking, on every request. Requiring anybody is per route.
  app.use(attachViewer(db))

  /**
   * Runs a handler inside the workspace the caller is signed into.
   *
   * Two things happen here that make the rest of the file simpler to
   * trust. The request gets one transaction, so a mutation and the
   * portfolio it answers with are one consistent picture rather than two
   * reads either side of somebody else's write. And inside that
   * transaction the connection drops to an unprivileged role, so the
   * database applies its own policies to every query the handler makes —
   * including the ones that forget to mention the workspace.
   */
  const inWorkspace = (
    fn: (tx: Db, w: Workspace, req: Authed, res: Response) => Promise<unknown>,
  ) => route(async (req: Authed, res: Response) => {
    const viewer = requireViewer(req)
    const membership = requireMembership(req)
    const w: Workspace = {
      organizationId: membership.organizationId,
      memberId: membership.id,
      name: viewer.profile.name,
      timezone: viewer.timezone,
    }
    return scoped(
      db,
      { profileId: viewer.profile.id, organizationId: membership.organizationId },
      (tx) => fn(tx, w, req, res),
    )
  })

  /**
   * Every mutation answers with the authoritative portfolio — filtered to
   * what the asker may see, so a role that cannot view payments does not
   * receive them and then merely have them hidden.
   */
  const withPortfolio = (tx: Db, w: Workspace, res: Response, req: Authed) =>
    readPortfolio(tx, w.organizationId).then((portfolio) => res.json(visibleTo(portfolio, req)))

  const visibleTo = (portfolio: Awaited<ReturnType<typeof readPortfolio>>, req: Authed) => {
    /* This workspace's matrix, carried on the request — not the defaults
       compiled into the app. One process answers for every customer, so
       a module-level can() here would give an owner who granted their
       staff the books the same answer as one who did not. */
    const viewer = req.viewer
    if (viewer?.membership && !viewer.permissions.has('view:payments')) {
      return { ...portfolio, invoices: [] }
    }
    return portfolio
  }

  /* Reports whether the schema is actually there, not just whether the
     process is up: a deployment pointed at an unmigrated database is the
     failure most worth being able to see from outside. */
  app.get('/api/health', route(async (_req, res) => {
    /* Which sign-in methods this deployment actually has keys for —
       answerable from outside, without opening a browser. */
    const sso = configuredProviders().map((p) => p.id)
    try {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(properties)

      /* A schema that exists is not necessarily the schema this build
         wants. Without this the mismatch surfaces later as a query naming
         a column that is not there, wrapped by the ORM so the reason
         never reaches the browser — the hardest kind of fault to place. */
      const missing = await missingMigrations(db)
      if (missing.length) {
        res.status(503).json({
          ok: false,
          driver,
          schema: 'behind',
          missing,
          error: `This database is ${missing.length} migration${missing.length === 1 ? '' : 's'} behind the code (${missing.join(', ')}).`
            + ' Run docs/upgrade.sql against it.',
          properties: count,
          sso,
        })
        return
      }

      res.json({ ok: true, driver, schema: 'ready', properties: count, sso })
    } catch (error) {
      /* "Failed query: …" is Drizzle talking about itself. What the
         database said is underneath it, and it is the only part worth
         reading: a wrong password, an unreachable host and an absent
         table all look identical until you go and get it. */
      const root = rootCause(error)
      const fault = classify(root.code, root.message)
      const { error: message, remedy } = explain(fault)
      res.status(503).json({
        ok: false,
        driver,
        schema: fault,
        error: message,
        remedy,
        detail: root.message,
        code: root.code,
        sso,
      })
    }
  }))

  /* ---------------------------- signing in --------------------------- *
   * Health and the auth routes are the only ones a stranger may reach.
   * Everything below them requires a session and the right role.
   * ------------------------------------------------------------------- */

  /** Who am I, and is anyone able to sign in at all yet. */
  app.get('/api/auth/me', route(async (req: Authed, res) => {
    const viewer = req.viewer
    if (!viewer) {
      res.json({
        member: null,
        // Only meaningful before the first password exists; false forever after.
        setupNeeded: await noAccountsYet(db),
        hasPassword: false,
        identities: [],
        workspace: null,
        workspaces: [],
      })
      return
    }

    const workspaces = await membershipsFor(db, viewer.profile.id)
    const current = viewer.membership
    res.json({
      member: publicMember(viewer),
      setupNeeded: false,
      hasPassword: !!viewer.profile.passwordHash,
      identities: await identitiesFor(db, viewer.profile.id),
      /* Which workspace this session is looking at, and which others this
         person could switch to — an agency bookkeeper working for two
         landlords has one login and two of these. */
      workspace: current
        ? workspaces.find((m) => m.organizationId === current.organizationId) ?? null
        : null,
      workspaces,
    })
  }))

  /**
   * First run only: creates the owner account.
   *
   * A production database arrives with no people in it at all, so this is
   * the one route that can add one without already being signed in. The
   * window closes the instant any account has a password, which makes it
   * a bootstrap rather than a registration form — there is no second way
   * to reach it and nothing to reopen it.
   */
  app.post('/api/auth/setup', route(async (req, res) => {
    if (!await noAccountsYet(db)) throw new Forbidden('This portfolio is already set up.')

    /* An operator who wants the window closed even before first use can set
       SETUP_TOKEN; without it the only protection is doing this promptly. */
    const expected = process.env.SETUP_TOKEN
    if (expected && String(req.body?.token ?? '') !== expected) {
      throw new Forbidden('That setup token is not right.')
    }

    const name = String(req.body?.name ?? '').trim()
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const workspaceName = String(req.body?.workspace ?? '').trim() || `${name}'s portfolio`
    if (name.length < 2) throw new BadRequest('Give the account a name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequest('That does not look like an email address.')

    const problem = rejectPassword(password, { name, email })
    if (problem) throw new BadRequest(problem)

    /* Unscoped on purpose, and the only route that is. Creating a
       workspace means writing an organization nobody is a member of yet,
       which is precisely what the policies exist to refuse — so this runs
       as the owning role, before any session exists, and closes the moment
       one account has a password. */
    const existing = await findByEmail(db, email)
    const profileId = existing?.id ?? `pr-${randomUUID().slice(0, 12)}`
    if (existing) {
      await db.update(profiles).set({ name }).where(eq(profiles.id, profileId))
    } else {
      await db.insert(profiles).values({ id: profileId, name, email })
    }
    await setPassword(db, profileId, password)

    /* A development database loaded with the sample portfolio already has
       people in it, none of them with passwords. Taking over one of those
       rows means adopting the workspace they are in — creating a second,
       empty one and leaving the portfolio invisible would look exactly
       like the seeder having failed. */
    const adopted = await defaultOrganization(db, profileId)
    const organizationId = adopted ?? (await createWorkspace(db, {
      organizationName: workspaceName,
      profileId,
      name,
    })).organizationId

    const { token, expiresAt } = await createSession(db, profileId, organizationId, req.get('user-agent'))
    setSessionCookie(res, token, expiresAt)
    const viewer = await readViewer(profileId, organizationId)
    res.json({ member: publicMember(viewer) })
  }))

  /** The signed-in shape, for the routes that have just created a session. */
  const readViewer = async (profileId: string, organizationId: string | null): Promise<Viewer> => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId))
    if (!profile) throw new NotFound('That account has gone.')
    const membership = organizationId
      ? (await db.select().from(organizationMembers).where(and(
          eq(organizationMembers.profileId, profileId),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, 'active'),
        )))[0] ?? null
      : null
    const permissions = membership
      ? new Set((await permissionMatrix(db, membership.organizationId))[membership.role] ?? [])
      : new Set<Permission>()
    const timezone = membership
      ? (await db.select({ zone: organizations.timezone }).from(organizations)
          .where(eq(organizations.id, membership.organizationId)))[0]?.zone ?? DEFAULT_TIMEZONE
      : DEFAULT_TIMEZONE
    return { profile, membership, permissions, timezone }
  }

  app.post('/api/auth/login', route(async (req, res) => {
    const email = String(req.body?.email ?? '')
    const password = String(req.body?.password ?? '')
    const profile = await findByEmail(db, email)

    /* One message for every failure. Saying "no such account" tells an
       attacker which addresses are worth attacking. */
    const refuse = () => { throw new Unauthorized('That email and password do not match an account.') }

    if (!profile || !profile.passwordHash) {
      // Spend comparable time either way so absence is not timeable.
      await equaliseTiming(password)
      refuse()
      return
    }
    const minutes = lockedFor(profile)
    if (minutes > 0) {
      throw new Unauthorized(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
    }
    if (!await verifyPassword(password, profile.passwordHash)) {
      await recordFailure(db, profile.id, profile.failedAttempts)
      refuse()
      return
    }

    await clearFailures(db, profile.id)
    const organizationId = await defaultOrganization(db, profile.id)
    const { token, expiresAt } = await createSession(db, profile.id, organizationId, req.get('user-agent'))
    setSessionCookie(res, token, expiresAt)
    res.json({ member: publicMember(await readViewer(profile.id, organizationId)) })
  }))

  /**
   * Switching workspaces.
   *
   * Nothing is trusted here beyond the identifier: the session is rewritten
   * to name the requested organization, and every policy then re-checks the
   * membership itself. Naming one this person does not belong to produces
   * an empty portfolio, not somebody else's.
   */
  app.post('/api/auth/workspace', route(async (req: Authed, res) => {
    const viewer = requireViewer(req)
    const wanted = String(req.body?.organizationId ?? '')
    const mine = await membershipsFor(db, viewer.profile.id)
    if (!mine.some((m) => m.organizationId === wanted)) {
      throw new Forbidden('You are not a member of that workspace.')
    }
    await destroySession(db, req.cookies?.[SESSION_COOKIE] as string | undefined)
    const { token, expiresAt } = await createSession(db, viewer.profile.id, wanted, req.get('user-agent'))
    setSessionCookie(res, token, expiresAt)
    res.json({ member: publicMember(await readViewer(viewer.profile.id, wanted)) })
  }))

  /* ------------------------- joining a workspace --------------------- *
   * Both of these are open to a stranger holding a link, because that is
   * what an invitation is: the token is the credential, it is stored only
   * as a hash, and it works once. Everything the new membership will be —
   * which workspace, which role, which properties — comes from the row
   * the inviter wrote, never from the request.
   * ------------------------------------------------------------------- */

  app.get('/api/auth/invitation/:token', route(async (req, res) => {
    const invitation = await invitationByToken(db, param(req, 'token'))
    res.json({
      invitation: {
        organization: invitation.organizationName,
        email: invitation.email,
        role: invitation.role,
        title: invitation.title,
        expiresAt: invitation.expiresAt,
      },
      // Whether they will be asked for a password or just to confirm.
      hasAccount: !!await findByEmail(db, invitation.email),
    })
  }))

  app.post('/api/auth/invitation/:token', route(async (req: Authed, res) => {
    const token = param(req, 'token')
    const name = String(req.body?.name ?? '').trim()
    const password = String(req.body?.password ?? '')

    const invitation = await invitationByToken(db, token)
    const existing = await findByEmail(db, invitation.email)
    let hash: string | undefined
    if (password) {
      const problem = rejectPassword(password, { name, email: invitation.email })
      if (problem) throw new BadRequest(problem)
      hash = await hashPassword(password)
    } else if (!existing?.passwordHash) {
      throw new BadRequest('Choose a password to finish setting up your account.')
    }

    const { profileId, organizationId } = await acceptInvitation(db, token, {
      name,
      passwordHash: hash ?? null,
      profileId: req.viewer?.profile.id,
    })

    const { token: session, expiresAt } = await createSession(db, profileId, organizationId, req.get('user-agent'))
    setSessionCookie(res, session, expiresAt)
    res.json({ member: publicMember(await readViewer(profileId, organizationId)) })
  }))

  app.post('/api/auth/logout', route(async (req, res) => {
    await destroySession(db, req.cookies?.[SESSION_COOKIE] as string | undefined)
    clearSessionCookie(res)
    res.json({ ok: true })
  }))

  /* ------------------- Google and Apple sign-in --------------------- *
   * Three routes: what is on offer, the leg that sends the browser to
   * the provider, and the leg it comes back to. The policy that decides
   * whether a verified identity may sign in lives in auth.ts.
   * ------------------------------------------------------------------ */

  /**
   * The origin this deployment is reached at, used for one thing: the
   * redirect URI, which has to match what is registered in the provider's
   * console exactly or the exchange is refused. PUBLIC_URL settles it;
   * otherwise it is read off the proxy headers. Nothing else derives a
   * destination from it, so a spoofed Host costs a failed sign-in rather
   * than a redirect somewhere it should not go.
   */
  const originOf = (req: Request) => {
    const explicit = process.env.PUBLIC_URL?.trim()
    if (explicit) return explicit.replace(/\/+$/, '')
    const first = (value: string | undefined, fallback: string) =>
      (value ?? fallback).split(',')[0]!.trim()
    const proto = first(req.get('x-forwarded-proto'), req.protocol || 'http')
    const host = first(req.get('x-forwarded-host'), req.get('host') ?? 'localhost:5173')
    return `${proto}://${host}`
  }

  const callbackUri = (req: Request, provider: string) =>
    `${originOf(req)}/api/auth/oauth/${provider}/callback`

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

  /**
   * Hands the browser back to the app.
   *
   * A plain 302 would be simpler, but Apple's callback is a cross-site
   * POST and browsers withhold a SameSite=Lax cookie on the redirect that
   * follows one — the session would be set and then not sent, which looks
   * exactly like a failed sign-in. Navigating from a document on our own
   * origin is unambiguously same-site, so the cookie travels.
   */
  const handBackToApp = (res: Response, target: string) => {
    const safe = escapeHtml(target)
    const forScript = JSON.stringify(target).replace(/</g, '\\u003c')
    res.status(200).type('html').send(
      '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Signing in…</title>'
      + `<meta http-equiv="refresh" content="0;url=${safe}">`
      + '<style>body{font:15px/1.6 system-ui,sans-serif;background:#12161c;color:#e9e4d9;'
      + 'display:grid;place-items:center;min-height:100vh;margin:0}a{color:#c9a227}</style>'
      + `</head><body><p>Signing you in… <a href="${safe}">continue</a></p>`
      + `<script>location.replace(${forScript})</script></body></html>`,
    )
  }

  /**
   * Failures come back to the sign-in screen with something readable.
   *
   * Relative, deliberately: an absolute target built from request headers
   * would be an open redirect wherever a proxy passes an attacker's Host
   * through. The provider's redirect URI has to be absolute — and it is
   * checked against a registered list — but this one does not.
   */
  const handBackWithError = (_req: Request, res: Response, message: string) =>
    handBackToApp(res, `/?sso_error=${encodeURIComponent(message)}`)

  /** Which buttons the sign-in screen should draw, and where to register
   *  each redirect URI — the value a console rejects for one character. */
  app.get('/api/auth/providers', route(async (req, res) => {
    res.json({
      providers: configuredProviders().map((p) => ({ ...p, redirectUri: callbackUri(req, p.id) })),
    })
  }))

  app.get('/api/auth/oauth/:provider/start', route(async (req, res) => {
    const id = param(req, 'provider')
    try {
      /* Closed during first run. The seeded addresses are placeholders
         nobody owns yet, and letting a public identity provider claim one
         would be a way in that no owner ever granted. */
      if (await noAccountsYet(db)) {
        throw new SsoError('Set up the first account with a password before using single sign-on.')
      }
      const { url, browserSecret, crossSite } = await beginOauth(db, id, callbackUri(req, id))
      setOauthCookie(res, browserSecret, crossSite)
      res.redirect(302, url)
    } catch (error) {
      if (error instanceof SsoError) { handBackWithError(req, res, error.message); return }
      throw error
    }
  }))

  /* Google comes back as a redirect, Apple as a form POST. Same handler. */
  const callback = route(async (req, res) => {
    const id = param(req, 'provider')
    const crossSite = req.method === 'POST'
    const field = (name: string) => {
      const source = (req.method === 'POST' ? req.body : req.query) as Record<string, unknown>
      const value = source?.[name]
      return typeof value === 'string' ? value : ''
    }
    try {
      /* The person pressed cancel on the provider's screen; that is not
         an error worth a scary message. */
      const refusal = field('error')
      if (refusal) {
        throw new SsoError(refusal === 'access_denied'
          ? 'That sign-in was cancelled.'
          : `The provider refused the sign-in (${refusal}).`)
      }

      const claims = await completeOauth(
        db, id, field('state'), field('code'),
        req.cookies?.[OAUTH_COOKIE] as string | undefined,
      )
      const profile = await profileForIdentity(db, id, claims)

      clearOauthCookie(res, crossSite)
      const organizationId = await defaultOrganization(db, profile.id)
      const { token, expiresAt } = await createSession(db, profile.id, organizationId, req.get('user-agent'))
      setSessionCookie(res, token, expiresAt)
      handBackToApp(res, '/')
    } catch (error) {
      clearOauthCookie(res, crossSite)
      if (error instanceof SsoError) { handBackWithError(req, res, error.message); return }
      throw error
    }
  })
  app.get('/api/auth/oauth/:provider/callback', callback)
  app.post('/api/auth/oauth/:provider/callback', callback)

  /** Unlinking your own. Refused when it is the last way into the
   *  account — locking yourself out should take more than one button. */
  app.delete('/api/auth/identities/:provider', route(async (req: Authed, res) => {
    const { profile } = requireViewer(req)
    try {
      await unlinkIdentity(db, profile, param(req, 'provider'))
    } catch (error) {
      if (error instanceof NotLinked) throw new NotFound(error.message)
      if (error instanceof LastWayIn) throw new Conflict(error.message)
      throw error
    }
    res.json({ identities: await identitiesFor(db, profile.id) })
  }))

  /** Changing your own password. Requires the current one, and signs out
   *  every other session — a change is usually a response to a worry. */
  app.put('/api/auth/password', route(async (req: Authed, res) => {
    const viewer = requireViewer(req)
    const { profile } = viewer
    const current = String(req.body?.current ?? '')
    const next = String(req.body?.next ?? '')
    /* An account that only ever signed in with Google has no current
       password to prove. The session is the proof, and refusing here
       would leave that person unable to add a second way in at all. */
    if (profile.passwordHash && !await verifyPassword(current, profile.passwordHash)) {
      throw new Unauthorized('That is not your current password.')
    }
    const problem = rejectPassword(next, profile)
    if (problem) throw new BadRequest(problem)

    await setPassword(db, profile.id, next)
    await destroyAllSessions(db, profile.id)
    const organizationId = viewer.membership?.organizationId ?? null
    const { token, expiresAt } = await createSession(db, profile.id, organizationId, req.get('user-agent'))
    setSessionCookie(res, token, expiresAt)
    res.json({ ok: true })
  }))

  /** An owner giving somebody a password, or replacing a forgotten one. */
  /**
   * An owner giving somebody a password, or replacing a forgotten one.
   *
   * The membership is looked up inside the workspace scope, so an owner
   * can only ever reach their own colleagues; the password itself is then
   * written to the profile, which is not workspace-scoped — one person,
   * one login, however many workspaces they work in.
   */
  app.put('/api/team/:id/password', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      const id = param(req, 'id')
      const password = String(req.body?.password ?? '')
      const [member] = await tx.select({
        profileId: organizationMembers.profileId,
        name: profiles.name,
        email: profiles.email,
      })
        .from(organizationMembers)
        .innerJoin(profiles, eq(profiles.id, organizationMembers.profileId))
        .where(and(
          eq(organizationMembers.id, id),
          eq(organizationMembers.organizationId, w.organizationId),
        ))
      if (!member) throw new NotFound(`team member ${id} not found`)
      const problem = rejectPassword(password, member)
      if (problem) throw new BadRequest(problem)

      /* Only for somebody whose account exists solely to work here. The
         same login can be a seat in another workspace — an agency
         bookkeeper keeping two landlords' books — and setting its password
         would hand this workspace the keys to the other one. Read
         unscoped, deliberately: the whole point is to see the memberships
         this workspace cannot. */
      const [elsewhere] = await db.select({ n: sql<number>`count(*)::int` })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.profileId, member.profileId),
          sql`${organizationMembers.organizationId} <> ${w.organizationId}`,
        ))
      if ((elsewhere?.n ?? 0) > 0) {
        throw new Conflict(
          'That account also works in another workspace, so only they can change '
          + 'its password. Ask them to reset it from their own sign-in.',
        )
      }

      await setPassword(db, member.profileId, password)
      // Whatever they were doing with the old one, they are not any more.
      await destroyAllSessions(db, member.profileId)
      return withPortfolio(tx, w, res, req)
    }))

  app.get('/api/portfolio', requirePermission('view:dashboard'),
    inWorkspace((tx, w, req, res) => withPortfolio(tx, w, res, req)))

  app.post('/api/invoices/:id/payment', requirePermission('edit:payments'),
    inWorkspace(async (tx, w, req, res) => {
      await recordPayment(tx, w, param(req, 'id'))
      return withPortfolio(tx, w, res, req)
    }))

  app.post('/api/invoices/:id/reminder', requirePermission('edit:payments'),
    inWorkspace(async (tx, w, req, res) => {
      await sendReminder(tx, w, param(req, 'id'))
      return withPortfolio(tx, w, res, req)
    }))

  app.patch('/api/properties/:id/status', requirePermission('edit:properties'),
    inWorkspace(async (tx, w, req, res) => {
      await setPropertyStatus(tx, w, param(req, 'id'), req.body?.status)
      return withPortfolio(tx, w, res, req)
    }))

  app.patch('/api/maintenance/:id/status', requirePermission('edit:maintenance'),
    inWorkspace(async (tx, w, req, res) => {
      await setMaintenanceStatus(tx, w, param(req, 'id'), req.body?.status)
      return withPortfolio(tx, w, res, req)
    }))

  app.post('/api/maintenance', requirePermission('edit:maintenance'),
    inWorkspace(async (tx, w, req, res) => {
      await addMaintenance(tx, w, req.body)
      return withPortfolio(tx, w, res, req)
    }))

  app.post('/api/clients/:id/notes', requirePermission('edit:clients'),
    inWorkspace(async (tx, w, req, res) => {
      const text = String(req.body?.text ?? '').trim()
      if (!text) return res.status(400).json({ error: 'A note cannot be empty.' })
      await addNote(tx, w, param(req, 'id'), text)
      return withPortfolio(tx, w, res, req)
    }))

  /* ------------------------- creating records ------------------------ *
   * The client sends a record the factories in src/lib/create.ts already
   * completed. These routes check the shape they depend on so a malformed
   * payload is a 400 here rather than a constraint violation deeper down,
   * and leave the domain rules themselves to the schema.
   * ------------------------------------------------------------------- */

  class BadRequest extends Error {}

  /** Throws unless `value` is an object carrying every named string field. */
  function requireShape(value: unknown, fields: string[], what: string) {
    const record = value as Record<string, unknown> | null
    if (!record || typeof record !== 'object') throw new BadRequest(`A ${what} is required.`)
    for (const field of fields) {
      const v = record[field]
      if (typeof v !== 'string' || !v.trim()) {
        throw new BadRequest(`A ${what} needs ${field}.`)
      }
    }
    return record
  }

  app.post('/api/properties', requirePermission('edit:properties'),
    inWorkspace(async (tx, w, req, res) => {
      const body = req.body as Property
      requireShape(body, ['id', 'code', 'name', 'type', 'mode', 'status', 'managerId'], 'property')
      if (!body.address?.line1) throw new BadRequest('A property needs an address.')
      await addProperty(tx, w, body)
      return withPortfolio(tx, w, res, req)
    }))

  app.put('/api/properties/:id', requirePermission('edit:properties'),
    inWorkspace(async (tx, w, req, res) => {
      const body = req.body as Property
      requireShape(body, ['name', 'type', 'mode', 'status', 'managerId'], 'property')
      if (!body.address?.line1) throw new BadRequest('A property needs an address.')
      await updateProperty(tx, w, param(req, 'id'), body)
      return withPortfolio(tx, w, res, req)
    }))

  app.post('/api/clients', requirePermission('edit:clients'),
    inWorkspace(async (tx, w, req, res) => {
      const body = req.body as Client
      requireShape(body, ['id', 'name', 'kind', 'status'], 'client')
      await addClient(tx, w, body)
      return withPortfolio(tx, w, res, req)
    }))

  app.post('/api/bookings', requirePermission('edit:bookings'),
    inWorkspace(async (tx, w, req, res) => {
      const { booking, invoices } = (req.body ?? {}) as { booking: Booking; invoices: Invoice[] }
      requireShape(booking, ['id', 'reference', 'propertyId', 'clientId', 'mode', 'status', 'start'], 'agreement')
      if (booking.mode !== 'rental' && !booking.end) {
        throw new BadRequest('Only a rental may be open-ended; give the agreement an end date.')
      }
      await addBooking(tx, w, booking, Array.isArray(invoices) ? invoices : [])
      return withPortfolio(tx, w, res, req)
    }))

  app.put('/api/clients/:id', requirePermission('edit:clients'),
    inWorkspace(async (tx, w, req, res) => {
      const body = req.body as Client
      requireShape(body, ['name', 'kind', 'status'], 'client')
      await updateClient(tx, w, param(req, 'id'), body)
      return withPortfolio(tx, w, res, req)
    }))

  /* Arriving and leaving. Separate from editing the agreement, because
     they are things that happen rather than terms that change — and the
     date is accepted rather than assumed, so a departure noticed on
     Monday can still be recorded as the Friday it actually was. */
  app.post('/api/bookings/:id/check-in', requirePermission('edit:bookings'),
    inWorkspace(async (tx, w, req, res) => {
      const on = String(req.body?.on ?? '').trim() || undefined
      if (on && !/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new BadRequest('That is not a date.')
      await checkIn(tx, w, param(req, 'id'), on)
      return withPortfolio(tx, w, res, req)
    }))

  app.post('/api/bookings/:id/check-out', requirePermission('edit:bookings'),
    inWorkspace(async (tx, w, req, res) => {
      const on = String(req.body?.on ?? '').trim() || undefined
      if (on && !/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new BadRequest('That is not a date.')
      const settled = await checkOut(tx, w, param(req, 'id'), on)
      const portfolio = await readPortfolio(tx, w.organizationId)
      res.json({ ...visibleTo(portfolio, req), settled })
      return undefined
    }))

  app.put('/api/bookings/:id', requirePermission('edit:bookings'),
    inWorkspace(async (tx, w, req, res) => {
      const body = req.body as Booking
      requireShape(body, ['propertyId', 'clientId', 'mode', 'status', 'start'], 'agreement')
      if (body.mode !== 'rental' && !body.end) {
        throw new BadRequest('Only a rental may be open-ended; give the agreement an end date.')
      }
      await updateBooking(tx, w, param(req, 'id'), body)
      return withPortfolio(tx, w, res, req)
    }))

  app.delete('/api/properties/:id', requirePermission('edit:properties'),
    inWorkspace(async (tx, w, req, res) => {
      await deleteProperty(tx, w, param(req, 'id'))
      return withPortfolio(tx, w, res, req)
    }))

  app.delete('/api/clients/:id', requirePermission('edit:clients'),
    inWorkspace(async (tx, w, req, res) => {
      await deleteClient(tx, w, param(req, 'id'))
      return withPortfolio(tx, w, res, req)
    }))

  app.delete('/api/bookings/:id', requirePermission('edit:bookings'),
    inWorkspace(async (tx, w, req, res) => {
      await deleteBooking(tx, w, param(req, 'id'))
      return withPortfolio(tx, w, res, req)
    }))

  app.post('/api/team', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      const body = req.body as TeamMember & { password?: string }
      requireShape(body, ['id', 'name', 'role', 'title', 'email'], 'team member')

      let hash: string | undefined
      if (body.password) {
        const problem = rejectPassword(body.password, body)
        if (problem) throw new BadRequest(problem)
        hash = await hashPassword(body.password)
      }
      await addMember(tx, w, body, hash)
      return withPortfolio(tx, w, res, req)
    }))

  app.put('/api/team/:id', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      const body = req.body as TeamMember
      requireShape(body, ['name', 'role', 'title'], 'team member')
      await updateMember(tx, w, param(req, 'id'), body)
      return withPortfolio(tx, w, res, req)
    }))

  app.delete('/api/team/:id', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      await deleteMember(tx, w, param(req, 'id'))
      return withPortfolio(tx, w, res, req)
    }))

  /* ---------------------- team and access ---------------------------- *
   * What a subscription is paying for, who is using it, and who has been
   * asked and not yet answered. The seat arithmetic is the server's, not
   * the interface's: a browser can be told anything, and the number that
   * decides whether an invitation goes out has to be counted where the
   * rows are.
   * ------------------------------------------------------------------- */

  app.get('/api/workspace', requirePermission('manage:team'),
    inWorkspace(async (tx, w, _req, res) => {
      const [organization] = await tx.select().from(organizations)
        .where(eq(organizations.id, w.organizationId))
      res.json({
        organization: organization
          ? { id: organization.id, name: organization.name, slug: organization.slug }
          : null,
        seats: await seatUsage(tx, w.organizationId),
        invitations: await openInvitations(tx, w.organizationId),
      })
    }))

  /**
   * Inviting somebody.
   *
   * The refusal an owner hits when the plan is full is a 402, not a 403:
   * they are allowed to do this, and the thing in the way is the
   * subscription. The body carries the seat figures so the upgrade prompt
   * can say what is full and by how much rather than "something went
   * wrong".
   */
  app.post('/api/workspace/invitations', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      const viewer = requireViewer(req)
      const body = req.body as { email?: string; role?: string; title?: string; propertyIds?: string[] }
      requireShape(body, ['email', 'role'], 'invitation')

      const invitation = await inviteMember(tx, w.organizationId, viewer.profile.id, {
        email: String(body.email),
        role: body.role as TeamMember['role'],
        title: body.title,
        propertyIds: Array.isArray(body.propertyIds) ? body.propertyIds : [],
      })

      /* Altier has no mail server, so the link is handed back to the
         person doing the inviting to pass on however they like. Saying it
         had been emailed would be a lie the recipient discovers by
         waiting. */
      res.json({
        invitation: { id: invitation.id, email: invitation.email, role: invitation.role },
        link: `${originOf(req)}/#/join/${invitation.token}`,
        seats: await seatUsage(tx, w.organizationId),
        invitations: await openInvitations(tx, w.organizationId),
      })
    }))

  app.delete('/api/workspace/invitations/:id', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      await revokeInvitation(tx, w.organizationId, param(req, 'id'))
      res.json({
        seats: await seatUsage(tx, w.organizationId),
        invitations: await openInvitations(tx, w.organizationId),
      })
    }))

  /* --------------------------- permissions --------------------------- *
   * What each role reaches, which used to be a constant compiled into the
   * app and drawn in Settings as ticks nobody could press. It is the
   * customer's question — whether their accountant may edit a tenancy,
   * whether a manager sees the books — so they answer it.
   * ------------------------------------------------------------------- */

  app.get('/api/permissions', requirePermission('manage:settings'),
    inWorkspace(async (tx, w, _req, res) => {
      res.json({ permissions: await permissionMatrix(tx, w.organizationId), all: ALL_PERMISSIONS })
    }))

  app.put('/api/permissions', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      const role = String(req.body?.role ?? '') as TeamMember['role']
      const permission = String(req.body?.permission ?? '') as Permission
      const allowed = req.body?.allowed === true
      if (!role || !permission) throw new BadRequest('A role and a permission are required.')
      await setRolePermission(tx, w.organizationId, role, permission, allowed)
      return withPortfolio(tx, w, res, req)
    }))

  app.delete('/api/permissions', requirePermission('manage:team'),
    inWorkspace(async (tx, w, req, res) => {
      const role = String(req.query?.role ?? '') as TeamMember['role']
      await resetPermissions(tx, w.organizationId, role || undefined)
      return withPortfolio(tx, w, res, req)
    }))

  /* ------------------------ tenants and guests ----------------------- *
   * Portal access is granted from the tenant's own record rather than
   * from the staff list, because it is a different kind of thing: it
   * reads one person's own agreement and charges, and on most plans it
   * costs nothing.
   * ------------------------------------------------------------------- */

  app.post('/api/clients/:id/portal', requirePermission('edit:clients'),
    inWorkspace(async (tx, w, req, res) => {
      const password = String(req.body?.password ?? '')
      let hash: string | undefined
      if (password) {
        const problem = rejectPassword(password, { name: '', email: '' })
        if (problem) throw new BadRequest(problem)
        hash = await hashPassword(password)
      }
      await grantPortalAccess(tx, w, param(req, 'id'), hash)
      res.json({ portal: await portalLogins(tx, w) })
    }))

  app.delete('/api/clients/:id/portal', requirePermission('edit:clients'),
    inWorkspace(async (tx, w, req, res) => {
      await revokePortalAccess(tx, w, param(req, 'id'))
      res.json({ portal: await portalLogins(tx, w) })
    }))

  app.get('/api/clients/portal', requirePermission('view:clients'),
    inWorkspace(async (tx, w, _req, res) => {
      res.json({ portal: await portalLogins(tx, w) })
    }))

  /** Which client records have a login, and whether it can be used yet. */
  const portalLogins = (tx: Db, w: Workspace) =>
    tx.select({
      clientId: organizationMembers.clientId,
      memberId: organizationMembers.id,
      email: profiles.email,
      hasPassword: sql<boolean>`${profiles.passwordHash} is not null`,
      since: organizationMembers.since,
    })
      .from(organizationMembers)
      .innerJoin(profiles, eq(profiles.id, organizationMembers.profileId))
      .where(and(
        eq(organizationMembers.organizationId, w.organizationId),
        eq(organizationMembers.role, 'tenant'),
      ))

  /* --------------------------- super admin --------------------------- *
   * Altier's own support desk. One flag on one profile, set by hand in
   * the database and reachable through nothing a customer can press.
   * Deliberately read-only and deliberately thin: it lists workspaces and
   * their size so support can answer "how big is this account", and it
   * does not open anybody's records.
   * ------------------------------------------------------------------- */

  const requireSuperAdmin = (req: Authed) => {
    const viewer = requireViewer(req)
    if (!viewer.profile.isSuperAdmin) {
      /* The same answer a signed-in customer gets for any route they may
         not have. Confirming the area exists would tell them what to
         attack. */
      throw new Forbidden('Your role does not allow this.')
    }
    return viewer
  }

  app.get('/api/admin/organizations', route(async (req: Authed, res) => {
    requireSuperAdmin(req)
    const rows = await db.select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
      seatLimit: subscriptions.seatLimit,
      members: sql<number>`(
        select count(*)::int from organization_members om
        where om.organization_id = ${organizations.id} and om.role <> 'tenant'
      )`,
      tenants: sql<number>`(
        select count(*)::int from organization_members om
        where om.organization_id = ${organizations.id} and om.role = 'tenant'
      )`,
      properties: sql<number>`(
        select count(*)::int from properties p where p.organization_id = ${organizations.id}
      )`,
    })
      .from(organizations)
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
      .orderBy(organizations.createdAt)
    res.json({ organizations: rows })
  }))

  app.put('/api/settings/reminders', requirePermission('manage:settings'),
    inWorkspace(async (tx, w, req, res) => {
      await updateReminders(tx, w, req.body ?? {})
      return withPortfolio(tx, w, res, req)
    }))

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    /* 401 means "sign in"; the client turns it into the login screen. 403
       means signed in and still not allowed, which is a different message
       and must never be answered by asking them to sign in again. */
    if (err instanceof Unauthorized) {
      res.status(401).json({ error: err.message })
      return
    }
    if (err instanceof Forbidden) {
      res.status(403).json({ error: err.message })
      return
    }
    if (err instanceof NotFound) {
      res.status(404).json({ error: err.message })
      return
    }
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message })
      return
    }
    // A refusal the caller can act on: the request was well formed, the
    // state of the portfolio is what stands in the way.
    if (err instanceof BadPermission) {
      res.status(400).json({ error: err.message })
      return
    }
    if (err instanceof Conflict || err instanceof BadInvitation) {
      res.status(409).json({ error: err.message })
      return
    }
    /* 402 Payment Required, for once literally. The request was allowed
       and correct; the subscription is what is in the way, so the client
       shows an upgrade prompt rather than an error. The seat figures ride
       along so that prompt can be specific. */
    if (err instanceof SeatLimit) {
      res.status(402).json({ error: err.message, seats: err.usage, upgrade: true })
      return
    }
    if (err instanceof NoSubscription) {
      res.status(402).json({ error: err.message, upgrade: true })
      return
    }
    /* Drizzle wraps a driver error, putting its own "failed query" text on
       message and the database's on cause — so the constraint name is only
       found by walking the chain. A rejected constraint is a client error. */
    const chain: string[] = []
    for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; depth++) {
      chain.push(e.message)
      e = e.cause
    }
    const violation = chain.find((m) => /violates .*constraint/i.test(m))
    console.error(err)
    if (violation) {
      res.status(422).json({ error: violation })
      return
    }
    res.status(500).json({ error: err.message })
  })

  return app
}

/** Opens the database and builds the app around it. */
export async function buildApp() {
  const { db, driver, migrate, close } = await connect()
  return { app: createApp(db, driver), driver, migrate, close }
}
