/* ------------------------------------------------------------------ *
 * Google Maps, loaded once
 *
 * The portfolio map used to be a schematic: coordinates hashed out of
 * the district name and spread over a square. It clustered units by
 * neighbourhood, which is all it ever claimed to do, and it could not
 * tell you where anything was. Nobody can be sent to a hashed dot.
 *
 * This loads the real thing when a key is configured, and says plainly
 * when one is not — rather than drawing a grey rectangle and letting
 * somebody wonder whether the map is broken or the internet is.
 *
 * The types are hand-written and cover only what is used here. Pulling in
 * the full @types/google.maps for six calls would be a dependency to keep
 * current for no more safety than this.
 * ------------------------------------------------------------------ */

import type { LatLng } from './geo.js'

export type { LatLng }
export { KAMPALA, onEarth, pinOf, roundPin } from './geo.js'

export interface GMarker {
  setPosition(position: LatLng): void
  setMap(map: GMap | null): void
  addListener(event: string, fn: () => void): void
}

export interface GMap {
  setCenter(position: LatLng): void
  setZoom(zoom: number): void
  fitBounds(bounds: GBounds, padding?: number): void
  addListener(event: string, fn: (e: { latLng?: { lat(): number; lng(): number } }) => void): void
}

export interface GBounds {
  extend(position: LatLng): void
  isEmpty(): boolean
}

export interface MapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GMap
  /* Classic markers rather than AdvancedMarkerElement: an advanced marker
     needs a cloud-configured map id, which is one more thing to set up
     before anybody sees a pin. */
  Marker: new (options: Record<string, unknown>) => GMarker
  LatLngBounds: new () => GBounds
  Geocoder: new () => {
    geocode(
      request: { address: string },
      callback: (results: Array<{ geometry: { location: { lat(): number; lng(): number } } }> | null, status: string) => void,
    ): void
  }
}

/**
 * The browser key, from the build's environment.
 *
 * Read through a guard because this module is imported by code that also
 * runs under Node in the checks, where import.meta.env does not exist.
 */
export const MAPS_KEY: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) || ''

export const mapsConfigured = () => MAPS_KEY.length > 0

declare global {
  interface Window { google?: { maps?: MapsApi } }
}

let pending: Promise<MapsApi> | null = null

/**
 * Loads the Maps JavaScript API, once per page.
 *
 * Several maps can ask at the same time — the portfolio view and a form
 * behind it — and they all wait on the same script tag rather than
 * racing to add their own.
 */
export function loadMaps(): Promise<MapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (pending) return pending

  if (!MAPS_KEY) {
    return Promise.reject(new Error('No Google Maps key is configured for this build.'))
  }

  pending = new Promise<MapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-altier-maps]')
    const script = existing ?? document.createElement('script')
    script.dataset.altierMaps = 'true'
    script.async = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&libraries=geocoding&loading=async`
    script.onload = () => {
      const maps = window.google?.maps
      if (maps) resolve(maps)
      else reject(new Error('Google Maps loaded but did not register itself.'))
    }
    script.onerror = () => {
      /* Let the next attempt try again: a failed load is usually a network
         blip or a key that has just been corrected, not a permanent state. */
      pending = null
      script.remove()
      reject(new Error('Google Maps could not be reached.'))
    }
    if (!existing) document.head.append(script)
  })

  return pending
}
