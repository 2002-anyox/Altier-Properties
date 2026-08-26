/* ------------------------------------------------------------------ *
 * Interface language
 *
 * Coverage note: this dictionary covers the application frame —
 * navigation, section headings, the top bar, common actions and status
 * labels. Page body copy and the sample portfolio itself stay in
 * English, the same way a real system translates its interface but not
 * the data a customer typed in.
 *
 * The Swahili strings should be reviewed by a native speaker before
 * this reaches real users.
 * ------------------------------------------------------------------ */

export type Language = 'en' | 'sw'

export const LANGUAGES: Array<{ code: Language; label: string; native: string; coverage: string }> = [
  { code: 'en', label: 'English', native: 'English', coverage: 'Complete' },
  { code: 'sw', label: 'Swahili', native: 'Kiswahili', coverage: 'Navigation and controls' },
]

type Dict = Record<string, string>

const en: Dict = {
  'nav.overview': 'Overview',
  'nav.portfolio': 'Portfolio',
  'nav.operations': 'Operations',
  'nav.insight': 'Insight',
  'nav.dashboard': 'Dashboard',
  'nav.availability': 'Availability',
  'nav.properties': 'Properties',
  'nav.bookings': 'Bookings & leases',
  'nav.clients': 'Clients',
  'nav.payments': 'Payments',
  'nav.maintenance': 'Maintenance',
  'nav.notifications': 'Notifications',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',

  'action.search': 'Search properties, clients, invoices…',
  'action.viewAs': 'View as',
  'action.markAllRead': 'Mark all read',
  'action.notifications': 'Notifications',
  'action.unread': 'unread',
  'action.openCentre': 'Open notification centre',
  'action.themeLight': 'Switch to light theme',
  'action.themeDark': 'Switch to dark theme',
  'action.openNav': 'Open navigation',
  'action.closeNav': 'Close navigation',
  'action.skip': 'Skip to main content',

  'status.available': 'Available',
  'status.occupied': 'Occupied',
  'status.reserved': 'Reserved',
  'status.maintenance': 'Under maintenance',
  'status.inactive': 'Inactive',
}

const sw: Dict = {
  'nav.overview': 'Muhtasari',
  'nav.portfolio': 'Mali',
  'nav.operations': 'Shughuli',
  'nav.insight': 'Uchambuzi',
  'nav.dashboard': 'Dashibodi',
  'nav.availability': 'Upatikanaji',
  'nav.properties': 'Majengo',
  'nav.bookings': 'Mikataba',
  'nav.clients': 'Wateja',
  'nav.payments': 'Malipo',
  'nav.maintenance': 'Matengenezo',
  'nav.notifications': 'Arifa',
  'nav.reports': 'Ripoti',
  'nav.settings': 'Mipangilio',

  'action.search': 'Tafuta majengo, wateja, ankara…',
  'action.viewAs': 'Tazama kama',
  'action.markAllRead': 'Weka zote zimesomwa',
  'action.notifications': 'Arifa',
  'action.unread': 'hazijasomwa',
  'action.openCentre': 'Fungua kituo cha arifa',
  'action.themeLight': 'Badili kwenda mwanga',
  'action.themeDark': 'Badili kwenda giza',
  'action.openNav': 'Fungua menyu',
  'action.closeNav': 'Funga menyu',
  'action.skip': 'Rukia maudhui makuu',

  'status.available': 'Inapatikana',
  'status.occupied': 'Imekaliwa',
  'status.reserved': 'Imehifadhiwa',
  'status.maintenance': 'Inafanyiwa matengenezo',
  'status.inactive': 'Haitumiki',
}

const DICTS: Record<Language, Dict> = { en, sw }

/** Active language, read during render — mirrors the presentation object. */
export const activeLanguage = { code: 'en' as Language }

export function setLanguage(code: Language) {
  activeLanguage.code = code
}

/** Falls back to English for anything a language has not covered yet. */
export const t = (key: string): string =>
  DICTS[activeLanguage.code][key] ?? en[key] ?? key
