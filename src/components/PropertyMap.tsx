import { useEffect, useRef, useState } from 'react'
import { MapPin, MapPinOff } from 'lucide-react'
import {
  KAMPALA, loadMaps, mapsConfigured, onEarth, pinOf, roundPin,
  type GMap, type GMarker, type LatLng, type MapsApi,
} from '../lib/maps.js'
import type { Property, PropertyStatus } from '../lib/types.js'
import { PROPERTY_STATUS_META, cx } from './ui'

/* The pin colours match the status chips. A map that colours "occupied"
   differently from the badge next to it is two facts, not one. */
const PIN_COLOUR: Record<PropertyStatus, string> = {
  available: '#0CA30C',
  occupied: '#2A6FD6',
  reserved: '#A87C22',
  maintenance: '#EC835A',
  inactive: '#6B7889',
}

/**
 * The shared plumbing: a div, a map in it, and whatever the caller wants
 * drawn on top. Handles the three states a map has — no key configured,
 * loading, and failed — because each needs a different sentence and the
 * pages using this should not each write their own.
 */
function useMap(draw: (maps: MapsApi, map: GMap) => (() => void) | void, deps: unknown[]) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<GMap | null>(null)
  const [api, setApi] = useState<MapsApi | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (!mapsConfigured()) { setError('unconfigured'); return }
    loadMaps().then(
      (maps) => { if (live) setApi(maps) },
      (e: Error) => { if (live) setError(e.message) },
    )
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!api || !host.current) return
    if (!map.current) {
      map.current = new api.Map(host.current, {
        center: KAMPALA,
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        /* Google's default map has every restaurant in Kampala on it,
           which is noise on a map about twenty four homes. */
        styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      })
    }
    return draw(api, map.current) ?? undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ...deps])

  return { host, api, error, map }
}

/** What to show when there is no map to show. */
function MapNotice({ error }: { error: string }) {
  const unconfigured = error === 'unconfigured'
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <MapPinOff size={20} className="text-ink-muted" aria-hidden />
      <p className="text-[13px] font-semibold text-ink">
        {unconfigured ? 'The map is not switched on' : 'The map could not load'}
      </p>
      <p className="max-w-sm text-[12px] leading-relaxed text-ink-muted">
        {unconfigured
          ? 'Add a Google Maps browser key as VITE_GOOGLE_MAPS_API_KEY and redeploy. Everything else works without one.'
          : error}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The portfolio, on a map
 * ------------------------------------------------------------------ */

export function PortfolioMap({
  properties, selectedId, onSelect, className,
}: {
  properties: Property[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  className?: string
}) {
  const pinned = properties.filter((p) => pinOf(p.address))
  const markers = useRef<GMarker[]>([])

  const { host, error } = useMap((maps, map) => {
    for (const marker of markers.current) marker.setMap(null)
    markers.current = []

    const bounds = new maps.LatLngBounds()
    for (const property of pinned) {
      const at = pinOf(property.address)!
      const marker = new maps.Marker({
        map,
        position: at,
        title: `${property.name} · ${PROPERTY_STATUS_META[property.status].label}`,
        icon: {
          path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
          fillColor: PIN_COLOUR[property.status],
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
          scale: property.id === selectedId ? 0.85 : 0.6,
        },
      })
      if (onSelect) marker.addListener('click', () => onSelect(property.id))
      markers.current.push(marker)
      bounds.extend(at)
    }

    /* One home would otherwise be framed at street level, which looks
       like a bug rather than a portfolio. */
    if (pinned.length > 1) map.fitBounds(bounds, 48)
    else if (pinned.length === 1) { map.setCenter(pinOf(pinned[0]!.address)!); map.setZoom(15) }

    return () => { for (const marker of markers.current) marker.setMap(null) }
  }, [pinned.map((p) => `${p.id}:${p.status}:${p.address.lat},${p.address.lng}`).join('|'), selectedId])

  const unpinned = properties.length - pinned.length

  return (
    <div className={cx('relative overflow-hidden rounded-2xl border border-line bg-surface-inset', className)}>
      {error ? <MapNotice error={error} /> : <div ref={host} className="h-full w-full" />}
      {!error && unpinned > 0 && (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-surface-card/90 px-3 py-1.5 text-[11.5px] text-ink-secondary shadow-card backdrop-blur">
          {unpinned} {unpinned === 1 ? 'property has' : 'properties have'} no pin yet — set one when editing it.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Placing a pin
 * ------------------------------------------------------------------ */

export function PinPicker({
  value, onChange, address, className,
}: {
  value: LatLng | null
  onChange: (pin: LatLng | null) => void
  /** Used by "find the address", so somebody need not hunt for their own street. */
  address?: string
  className?: string
}) {
  const marker = useRef<GMarker | null>(null)
  /* The pin the map is already showing. Without it, dragging the marker
     would report a new value, the effect would run, and the map would
     re-centre and re-zoom under the finger still holding the pin. */
  const shown = useRef<LatLng | null>(null)
  const [looking, setLooking] = useState(false)
  const [missed, setMissed] = useState<string | null>(null)

  /* The map's listeners are attached once and keep the closure they were
     attached with. Reporting through a ref means they always call the
     current handler rather than the one from the first render. */
  const report = useRef(onChange)
  report.current = onChange
  const place = (pin: LatLng | null) => { shown.current = pin; report.current(pin) }

  const { host, api, map, error } = useMap((maps, m) => {
    if (!marker.current) {
      marker.current = new maps.Marker({
        map: value ? m : null,
        position: value ?? KAMPALA,
        draggable: true,
      })
      /* Dragging is the natural correction once a pin is roughly right;
         clicking is how it gets placed the first time. */
      marker.current.addListener('dragend', () => {
        const at = (marker.current as unknown as { getPosition(): { lat(): number; lng(): number } }).getPosition()
        place({ lat: roundPin(at.lat()), lng: roundPin(at.lng()) })
      })
      m.addListener('click', (e) => {
        if (!e.latLng) return
        const pin = { lat: roundPin(e.latLng.lat()), lng: roundPin(e.latLng.lng()) }
        marker.current?.setPosition(pin)
        marker.current?.setMap(m)
        place(pin)
      })
    }

    /* Only move the map when the pin came from somewhere other than the
       map itself — first load, a geocode, or the form being reopened. */
    const same = shown.current && value
      && shown.current.lat === value.lat && shown.current.lng === value.lng
    if (value && !same) {
      marker.current.setPosition(value)
      marker.current.setMap(m)
      m.setCenter(value)
      m.setZoom(16)
    }
    if (!value) marker.current.setMap(null)
    shown.current = value
  }, [value?.lat, value?.lng])

  const find = () => {
    if (!api || !address?.trim() || !map.current) return
    setLooking(true)
    setMissed(null)
    new api.Geocoder().geocode({ address }, (results, status) => {
      setLooking(false)
      const hit = results?.[0]
      if (status !== 'OK' || !hit) {
        setMissed('That address could not be found. Drop the pin by hand instead.')
        return
      }
      const pin = { lat: roundPin(hit.geometry.location.lat()), lng: roundPin(hit.geometry.location.lng()) }
      if (!onEarth(pin)) { setMissed('That address came back with no usable location.'); return }
      /* Not place(): this pin came from outside the map, so the effect
         below should move the view to it. */
      onChange(pin)
    })
  }

  return (
    <div className={cx('grid gap-2', className)}>
      <div className="relative h-56 overflow-hidden rounded-2xl border border-line bg-surface-inset">
        {error ? <MapNotice error={error} /> : <div ref={host} className="h-full w-full" />}
      </div>
      {!error && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={12} aria-hidden />
            {value
              ? <span className="tnum text-ink-secondary">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>
              : 'Click the map to place the pin.'}
          </span>
          {address?.trim() && (
            <button type="button" onClick={find} disabled={looking || !api} className="font-medium text-gold-ink underline-offset-2 hover:underline disabled:opacity-50">
              {looking ? 'Looking…' : 'Find the address'}
            </button>
          )}
          {value && (
            <button type="button" onClick={() => place(null)} className="font-medium text-ink-secondary underline-offset-2 hover:underline">
              Clear
            </button>
          )}
        </div>
      )}
      {missed && <p className="text-[11.5px] text-[rgb(var(--c-status-critical))]">{missed}</p>}
    </div>
  )
}
