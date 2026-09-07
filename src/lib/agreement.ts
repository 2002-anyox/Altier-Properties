/* ------------------------------------------------------------------ *
 * What each kind of agreement actually needs
 *
 * A nightly stay, an open-ended rental and a fixed-term lease are three
 * different things wearing one form. A stay has a departure date and an
 * arrival time; a rental has neither, but it has the months taken up
 * front that are the whole reason it is safe to let open-ended; a lease
 * has an end date and a renewal to think about.
 *
 * Asking for all of it at once and greying out the parts that do not
 * apply is how a form becomes something people dread. So the shape of
 * the agreement decides what is on screen, and this is where that
 * decision lives — apart from the form, so it can be checked.
 * ------------------------------------------------------------------ */

import type { Property, TenancyMode } from './types.js'

export interface AgreementShape {
  /** Whether the agreement has an agreed end date at all. */
  end: boolean
  /** Months of rent taken before the keys change hands. */
  advance: boolean
  /** How much warning the tenant must give before leaving. */
  notice: boolean
  /** The times of day people arrive and leave — only a stay cares. */
  times: boolean
  startLabel: string
  endLabel: string
  rateLabel: string
  /** Reads after an amount: "1,200,000 a night". */
  rateUnit: string
  occupantsLabel: string
  /** The word for the people in it, singular. */
  occupantWord: string
}

const SHAPES: Record<TenancyMode, AgreementShape> = {
  short_stay: {
    end: true,
    advance: false,
    notice: false,
    times: true,
    startLabel: 'Arrival',
    endLabel: 'Departure',
    rateLabel: 'Nightly rate',
    rateUnit: 'a night',
    occupantsLabel: 'Guests',
    occupantWord: 'guest',
  },
  rental: {
    end: false,
    advance: true,
    notice: true,
    times: false,
    startLabel: 'Moves in',
    endLabel: '',
    rateLabel: 'Monthly rent',
    rateUnit: 'a month',
    occupantsLabel: 'Occupants',
    occupantWord: 'occupant',
  },
  long_term: {
    end: true,
    advance: false,
    notice: true,
    startLabel: 'Term starts',
    times: false,
    endLabel: 'Term ends',
    rateLabel: 'Monthly rent',
    rateUnit: 'a month',
    occupantsLabel: 'Occupants',
    occupantWord: 'occupant',
  },
}

export const fieldsFor = (mode: TenancyMode): AgreementShape => SHAPES[mode]

/** One sentence saying what this kind of agreement is, in the form. */
export const modeSummary = (mode: TenancyMode): string => ({
  short_stay: 'Nightly, with a fixed departure date. Charged for the whole stay up front.',
  rental: 'Runs until the tenant gives notice. Several months are taken up front, so nobody can leave after one and strand the unit.',
  long_term: 'A fixed term with an agreed end date, and a decision to make when it comes.',
}[mode])

export const MODE_LABEL: Record<TenancyMode, string> = {
  long_term: 'Fixed-term lease',
  rental: 'Open-ended rental',
  short_stay: 'Short stay',
}

/**
 * The deposit a unit asks for.
 *
 * A month and a half of a nightly rate is not a deposit anybody charges;
 * for a stay it is a night and a half's cover against damage, and for
 * anything longer it is the two months the business works to.
 */
export const depositFor = (property: Pick<Property, 'mode' | 'price'>) =>
  property.mode === 'short_stay'
    ? Math.round(property.price * 1.5)
    : property.price * 2

/** The times of day that agreement kind implies, unless changed. */
export const timesFor = (mode: TenancyMode) =>
  (mode === 'short_stay' ? { checkIn: '15:00', checkOut: '11:00' } : { checkIn: '12:00', checkOut: '12:00' })
