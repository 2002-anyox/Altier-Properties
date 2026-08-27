/* ------------------------------------------------------------------ *
 * What actually went wrong with a query
 *
 * Drizzle wraps the driver's error, putting its own "Failed query: …"
 * text on `message` and the database's real complaint on `cause`. So the
 * one sentence worth reading — "password authentication failed",
 * "relation does not exist", "getaddrinfo ENOTFOUND" — never reaches
 * anybody looking at the response. Every fault below was diagnosed the
 * hard way at least once for exactly that reason.
 * ------------------------------------------------------------------ */

/** A Postgres error carries a five-character SQLSTATE; a socket error a code. */
interface Chained { message?: string; code?: string; cause?: unknown }

/** Walks to the innermost cause, which is where the driver put the truth. */
export function rootCause(error: unknown): { message: string; code?: string } {
  let node = error as Chained | undefined
  let best = { message: String((error as Error)?.message ?? error), code: undefined as string | undefined }
  for (let depth = 0; node && depth < 6; depth += 1) {
    if (node.code || (node.message && !/^Failed query/.test(node.message))) {
      best = { message: node.message ?? best.message, code: node.code ?? best.code }
    }
    node = node.cause as Chained | undefined
  }
  return best
}

export type Fault =
  | 'unreachable'    // no route to the host, or it never answered
  | 'unauthorised'   // the host answered and refused the credentials
  | 'nodatabase'     // the host is right, the database named on the end is not
  | 'missing'        // connected, but the tables are not there
  | 'denied'         // connected, tables exist, this role may not read them
  | 'unknown'

/** Classifies a failed query into something a person can act on. */
export function classify(code: string | undefined, message: string): Fault {
  switch (code) {
    /* Socket-level: nothing answered, or the name does not resolve. */
    case 'ENOTFOUND': case 'ECONNREFUSED': case 'ETIMEDOUT':
    case 'EHOSTUNREACH': case 'ENETUNREACH': case 'EAI_AGAIN':
      return 'unreachable'
    case '28P01': case '28000': return 'unauthorised'   // bad password, bad role
    case '3D000': return 'nodatabase'                   // no such database
    case '42P01': case '3F000': return 'missing'        // no such table or schema
    case '42501': return 'denied'                       // permission denied
    default: break
  }
  if (/timeout|timed out/i.test(message)) return 'unreachable'
  if (/password authentication|role .* does not exist/i.test(message)) return 'unauthorised'
  if (/does not exist/i.test(message)) return 'missing'
  if (/permission denied/i.test(message)) return 'denied'
  return 'unknown'
}

/** The sentence to show, and the thing to do about it. */
export const explain = (fault: Fault): { error: string; remedy: string } => ({
  unreachable: {
    error: 'The database did not answer.',
    remedy: 'Check DATABASE_URL points at the pooled connection string (port 6543 on Supabase). '
      + 'The direct endpoint is IPv6-only and unreachable from most hosts.',
  },
  unauthorised: {
    error: 'The database refused the credentials.',
    remedy: 'The password in DATABASE_URL is wrong, or the placeholder was never replaced. '
      + 'Copy the connection string again and substitute the real password.',
  },
  nodatabase: {
    error: 'The server is there; the database named at the end of the URL is not.',
    remedy: 'DATABASE_URL ends with /<database>. Check that name against the one you created — '
      + 'on Supabase it is always "postgres".',
  },
  missing: {
    error: 'Connected, but this database has no Altier schema in it.',
    remedy: 'Run docs/setup.sql against it. If it refuses because tables already exist, '
      + 'DATABASE_URL is pointing at a different database than the one you set up.',
  },
  denied: {
    error: 'Connected, the tables are there, and this role may not read them.',
    remedy: 'Row Level Security is on and the connecting role is neither the owner nor exempt. '
      + 'Connect as the owner, or grant it access.',
  },
  unknown: {
    error: 'The database rejected the first query.',
    remedy: 'The detail below is the database\'s own words for it.',
  },
}[fault])
