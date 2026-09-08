/* ------------------------------------------------------------------ *
 * The published plans
 *
 * One definition, read by three places that must agree: the server, which
 * refuses an invitation past the seat limit; the workspace screen, which
 * says how many seats are left; and the landing page, which sells them.
 *
 * It lives here, free of any dependency, so the marketing copy cannot
 * quietly drift away from what the product actually enforces. A landing
 * page promising ten seats on a plan the server caps at three is a
 * refund conversation.
 * ------------------------------------------------------------------ */

export const PLANS = {
  starter: { label: 'Starter', seats: 3 },
  professional: { label: 'Professional', seats: 10 },
  /** Null is unlimited, not zero. */
  enterprise: { label: 'Enterprise', seats: null },
} as const satisfies Record<string, { label: string; seats: number | null }>

export type Plan = keyof typeof PLANS

/** How long a new workspace runs before it has to be paid for. */
export const TRIAL_DAYS = 7

/** How the seat allowance reads in a sentence. */
export const seatsLabel = (plan: Plan) => {
  const { seats } = PLANS[plan]
  return seats === null ? 'Unlimited seats' : `${seats} staff seats`
}
