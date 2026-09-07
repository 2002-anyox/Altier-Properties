/* ------------------------------------------------------------------ *
 * Coordinates
 *
 * The arithmetic of a pin, kept apart from the map that draws it. The
 * loader in maps.ts needs a browser; this needs nothing, so the checks
 * can run it under Node and the server can share the same rules the form
 * applies.
 * ------------------------------------------------------------------ */

export interface LatLng { lat: number; lng: number }

/** Kampala. Where a map with nothing on it should open. */
export const KAMPALA: LatLng = { lat: 0.3476, lng: 32.5825 }

/**
 * Whether a property has somewhere to be drawn.
 *
 * Half a pin is not half a location — it is a point in the Gulf of
 * Guinea, where every mis-set coordinate on earth ends up — so it counts
 * as no pin at all.
 */
export const pinOf = (address: { lat: number | null; lng: number | null }): LatLng | null =>
  (address.lat !== null && address.lng !== null ? { lat: address.lat, lng: address.lng } : null)

/** Six decimal places is about ten centimetres. Anything beyond it is noise. */
export const roundPin = (value: number) => Number(value.toFixed(6))

/** Refuses a pin that is not on the planet, which is what a typo produces. */
export const onEarth = (pin: LatLng) =>
  Number.isFinite(pin.lat) && Number.isFinite(pin.lng)
  && pin.lat >= -90 && pin.lat <= 90 && pin.lng >= -180 && pin.lng <= 180
