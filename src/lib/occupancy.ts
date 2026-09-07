/* ------------------------------------------------------------------ *
 * One home at a time
 *
 * A person lives somewhere. Letting the same client hold two units at
 * once is almost always a mistake somebody is about to make — the wrong
 * name picked off a list — and it quietly doubles their rent, because
 * every agreement raises its own charges. So a client takes on another
 * property only once they have moved out of the one they are in.
 *
 * "Moved out" is a fact, not a date passing: an agreement stops holding
 * a unit when somebody checks the tenant out, ends it, or cancels it.
 * A lease whose end date slipped past on Friday still holds the keys on
 * Monday, and that is correct — the tenant is still in there.
 *
 * The same functions run in the form and on the server, so the reason
 * shown before the click is the reason given after it.
 * ------------------------------------------------------------------ */

import type { Booking } from './types.js'

/** The parts of an agreement this rule reads. Server rows fit it too. */
export interface Hold {
  id: string
  propertyId: string
  clientId: string
  status: Booking['status']
  departedOn: string | null
}

/**
 * Whether an agreement still has a hold on its unit.
 *
 * Departure is what releases it. A completed or cancelled agreement is
 * over whatever its dates say, and anything else — pending, upcoming,
 * running — is a commitment on that unit until somebody says otherwise.
 */
export const isHolding = (b: Hold) =>
  b.departedOn === null && b.status !== 'completed' && b.status !== 'cancelled'

/** Every unit this client is currently committed to. */
export const holdsOf = <T extends Hold>(bookings: T[], clientId: string) =>
  bookings.filter((b) => b.clientId === clientId && isHolding(b))

/**
 * The agreement standing in the way of placing this client in this unit,
 * or null if nothing is.
 *
 * A second agreement on the same unit is not in the way — renewing a
 * lease, or a guest extending, is the same home. It is a *different*
 * home that the rule is about.
 */
export const holdBlocking = <T extends Hold>(bookings: T[], clientId: string, propertyId: string) =>
  holdsOf(bookings, clientId).find((b) => b.propertyId !== propertyId) ?? null

/**
 * Why the placement was refused, in words worth reading.
 *
 * Named so the caller passes the property's name rather than its id:
 * "already in p-m2k4x9" helps nobody.
 */
export const whyBlocked = (clientName: string, heldPropertyName: string, intoPropertyName: string) =>
  `${clientName} is still in ${heldPropertyName}. Check them out of it before placing them in `
  + `${intoPropertyName} — a client holds one home at a time.`
