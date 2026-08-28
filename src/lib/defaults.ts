/* ------------------------------------------------------------------ *
 * Defaults and fixed choices
 *
 * What a new workspace starts with, and the lists the forms offer. Not
 * data about anybody: settings a landlord will change and options they
 * will pick from.
 * ------------------------------------------------------------------ */

import type { ReminderSettings } from './types.js'

/**
 * Where a workspace is assumed to be until it says otherwise.
 *
 * A calendar day is a fact about a place, and the server runs wherever
 * the host puts it — so it stamps dates against this rather than against
 * its own clock. Uganda, because that is who this is built for.
 */
export const DEFAULT_TIMEZONE = 'Africa/Kampala'

/** Offered when adding a home. Free text is allowed alongside these. */
export const AMENITY_POOL = [
  'Standby generator', 'Borehole water', 'Water storage tank', 'Solar backup',
  '24-hour security', 'Gated compound', 'Perimeter wall', 'Servants quarters',
  'Air conditioning', 'Fitted kitchen', 'Fibre internet', 'DSTV connection',
  'Secure parking', 'Private garden', 'Balcony', 'Swimming pool',
  'Gym access', 'Lift access', 'Furnished', 'Mosquito screens',
]
export const COMMERCIAL_AMENITIES = [
  'Loading bay', '3-phase power', 'Standby generator', 'Fibre internet',
  'Secure parking', 'CCTV', 'Air conditioning', 'Meeting rooms',
  'Street frontage', 'Goods lift', '24-hour security',
]

export const DEFAULT_REMINDERS: ReminderSettings = {
  rentDueLeadDays: 5,
  leaseExpiryLeadDays: 60,
  checkInLeadHours: 24,
  vacancyAlertDays: 14,
  maintenanceLeadDays: 3,
  channels: { inApp: true, email: true, sms: false, push: true },
  quietHours: { enabled: true, from: '21:00', to: '07:30' },
  digest: 'daily',
}

/* -------------------------- notifications ------------------------- */
