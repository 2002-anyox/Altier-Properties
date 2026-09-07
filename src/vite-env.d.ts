/// <reference types="vite/client" />

/**
 * The build-time settings this app reads.
 *
 * Declared rather than inferred so a typo in a variable name is a
 * compile error instead of a silently empty string at runtime — which,
 * for the maps key, would look exactly like "no key configured".
 */
interface ImportMetaEnv {
  /** Google Maps browser key. Absent, the map falls back to the schematic. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
