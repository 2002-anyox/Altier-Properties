import { presentation } from './money.js'
import type {
  AppNotification, Booking, BookingSource, Client, Invoice, MaintenanceRequest,
  Property, PropertyDocument, PropertyStatus, PropertyType, ReminderSettings,
  TeamMember, TenancyMode,
} from './types.js'

/* ------------------------------------------------------------------ *
 * Deterministic PRNG — the demo portfolio must look identical on every
 * load, while still being anchored to today's real date.
 * ------------------------------------------------------------------ */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry(20260825)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo)
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1))
const chance = (p: number) => rnd() < p

/* ------------------------------ dates ----------------------------- */
export const TODAY = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (d: Date | string, n: number) => {
  const base = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d)
  base.setDate(base.getDate() + n)
  return base
}
export const dayOffset = (n: number) => iso(addDays(TODAY, n))
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

/* ------------------------------- team ----------------------------- */
export const TEAM: TeamMember[] = [
  { id: 'tm-01', name: 'Nakato Ssemakula', role: 'owner', title: 'Founder & Principal', email: 'nakato.ssemakula@altier.co.ug', phone: '+256 772 400 118', since: '2018-03-01' },
  { id: 'tm-02', name: 'Brian Kizito', role: 'manager', title: 'Head of Portfolio', email: 'brian.kizito@altier.co.ug', phone: '+256 772 776 240', since: '2019-06-14' },
  { id: 'tm-03', name: 'Aisha Namutebi', role: 'manager', title: 'Short-Stay Manager', email: 'aisha.namutebi@altier.co.ug', phone: '+256 701 550 907', since: '2021-01-11' },
  { id: 'tm-04', name: 'Tendo Wasswa', role: 'manager', title: 'Commercial Lettings', email: 'tendo.wasswa@altier.co.ug', phone: '+256 752 228 601', since: '2020-09-02' },
  { id: 'tm-05', name: 'Sarah Nabbosa', role: 'accountant', title: 'Financial Controller', email: 'sarah.nabbosa@altier.co.ug', phone: '+256 772 331 776', since: '2019-11-25' },
  { id: 'tm-06', name: 'Ronald Okello', role: 'staff', title: 'Operations & Turnover', email: 'ronald.okello@altier.co.ug', phone: '+256 701 118 442', since: '2022-04-19' },
  { id: 'tm-07', name: 'Patience Akello', role: 'staff', title: 'Guest Experience', email: 'patience.akello@altier.co.ug', phone: '+256 752 640 315', since: '2023-02-06' },
]
const MANAGERS = TEAM.filter((t) => t.role === 'manager').map((t) => t.id)

/* --------------------------- client names -------------------------- */
const TENANT_NAMES = [
  'Miriam Nakabugo', 'David Ssentongo', 'Grace Atim', 'Joseph Mukasa',
  'Sanyu Nabirye', 'Ibrahim Kagwa', 'Rebecca Auma', 'Peter Wanyama',
  'Esther Nalubega', 'Samuel Odongo', 'Winnie Kyomuhendo', 'Julius Bwire',
  'Claire Nassuna', 'Emmanuel Okot', 'Diana Namara', 'Ronald Tumusiime',
  'Lars Henriksen', 'Priya Raghunathan', 'Camille Berger', 'Tobias Reuter',
  'Yuki Tanaka', 'Rachel Whitfield', 'Marcus Oyelaran', 'Noor Haddad',
  'Andrei Munteanu', 'Chloe Marchetti', 'Hassan Qureshi', 'Greta Solheim',
]

/* ---------------------------- portfolio --------------------------- */
type Seed = {
  name: string; type: PropertyType; mode: TenancyMode; status: PropertyStatus
  district: string; beds: number; baths: number; sqm: number; price: number
  x: number; y: number
}

const SEEDS: Seed[] = [
  { name: 'Kololo Terrace 4B', type: 'apartment', mode: 'long_term', status: 'occupied', district: 'Kololo', beds: 3, baths: 3, sqm: 180, price: 6_500_000, x: 0.48, y: 0.38 },
  { name: 'Nakasero Hill Residence', type: 'house', mode: 'long_term', status: 'occupied', district: 'Nakasero', beds: 4, baths: 4, sqm: 320, price: 12_000_000, x: 0.44, y: 0.44 },
  { name: 'Bugolobi Serviced Flat 12', type: 'serviced', mode: 'short_stay', status: 'occupied', district: 'Bugolobi', beds: 2, baths: 2, sqm: 110, price: 320_000, x: 0.64, y: 0.52 },
  { name: 'Kololo Skyline 07', type: 'apartment', mode: 'short_stay', status: 'available', district: 'Kololo', beds: 2, baths: 2, sqm: 95, price: 380_000, x: 0.50, y: 0.34 },
  { name: 'Acacia Avenue Penthouse', type: 'apartment', mode: 'long_term', status: 'occupied', district: 'Kololo', beds: 3, baths: 3, sqm: 210, price: 9_500_000, x: 0.52, y: 0.40 },
  { name: 'Ntinda Garden Flat', type: 'apartment', mode: 'rental', status: 'available', district: 'Ntinda', beds: 2, baths: 1, sqm: 78, price: 1_300_000, x: 0.70, y: 0.30 },
  { name: 'Naguru Heights 9F', type: 'apartment', mode: 'rental', status: 'reserved', district: 'Naguru', beds: 3, baths: 2, sqm: 130, price: 3_200_000, x: 0.64, y: 0.36 },
  { name: 'Entebbe Lakeside Villa', type: 'villa', mode: 'short_stay', status: 'occupied', district: 'Entebbe', beds: 5, baths: 4, sqm: 380, price: 1_200_000, x: 0.06, y: 0.90 },
  { name: 'Munyonyo Bay House', type: 'villa', mode: 'short_stay', status: 'maintenance', district: 'Munyonyo', beds: 4, baths: 3, sqm: 290, price: 850_000, x: 0.58, y: 0.84 },
  { name: 'Nakasero Office Suite 300', type: 'commercial', mode: 'long_term', status: 'occupied', district: 'Nakasero', beds: 0, baths: 2, sqm: 420, price: 18_000_000, x: 0.46, y: 0.46 },
  { name: 'Bukoto Design Studio', type: 'commercial', mode: 'long_term', status: 'available', district: 'Bukoto', beds: 0, baths: 1, sqm: 165, price: 5_800_000, x: 0.62, y: 0.30 },
  { name: 'Muyenga Serviced Residence 2A', type: 'serviced', mode: 'short_stay', status: 'occupied', district: 'Muyenga', beds: 2, baths: 2, sqm: 105, price: 300_000, x: 0.56, y: 0.72 },
  { name: 'Muyenga Serviced Residence 2B', type: 'serviced', mode: 'short_stay', status: 'available', district: 'Muyenga', beds: 2, baths: 2, sqm: 105, price: 300_000, x: 0.57, y: 0.70 },
  { name: 'Old Kampala Stone Apartment', type: 'apartment', mode: 'short_stay', status: 'occupied', district: 'Old Kampala', beds: 1, baths: 1, sqm: 55, price: 210_000, x: 0.38, y: 0.48 },
  { name: 'Kansanga Family Unit 3D', type: 'apartment', mode: 'rental', status: 'occupied', district: 'Kansanga', beds: 3, baths: 2, sqm: 120, price: 1_800_000, x: 0.60, y: 0.66 },
  { name: 'Mbuya Hill Diplomat House', type: 'house', mode: 'long_term', status: 'occupied', district: 'Mbuya', beds: 5, baths: 4, sqm: 340, price: 14_000_000, x: 0.68, y: 0.50 },
  { name: 'Namanve Warehouse Unit 4', type: 'commercial', mode: 'long_term', status: 'reserved', district: 'Namanve', beds: 0, baths: 2, sqm: 640, price: 9_500_000, x: 0.90, y: 0.44 },
  { name: 'Kololo Duplex 5', type: 'apartment', mode: 'short_stay', status: 'occupied', district: 'Kololo', beds: 2, baths: 1, sqm: 80, price: 290_000, x: 0.46, y: 0.36 },
  { name: 'Najjera Family Home', type: 'house', mode: 'rental', status: 'available', district: 'Najjera', beds: 4, baths: 3, sqm: 230, price: 2_400_000, x: 0.80, y: 0.20 },
  { name: 'Nsambya Corporate 9C', type: 'apartment', mode: 'rental', status: 'occupied', district: 'Nsambya', beds: 2, baths: 2, sqm: 96, price: 2_600_000, x: 0.50, y: 0.60 },
  { name: 'Kyanja Micro-Unit 5', type: 'apartment', mode: 'short_stay', status: 'inactive', district: 'Kyanja', beds: 1, baths: 1, sqm: 40, price: 130_000, x: 0.74, y: 0.22 },
  { name: 'Lubowa Ridge Terrace', type: 'apartment', mode: 'short_stay', status: 'reserved', district: 'Lubowa', beds: 3, baths: 2, sqm: 145, price: 520_000, x: 0.30, y: 0.80 },
  { name: 'Kira Residence 11', type: 'apartment', mode: 'rental', status: 'maintenance', district: 'Kira', beds: 2, baths: 1, sqm: 84, price: 950_000, x: 0.86, y: 0.26 },
  { name: 'Kampala Road Retail Front', type: 'commercial', mode: 'long_term', status: 'occupied', district: 'Central', beds: 0, baths: 1, sqm: 150, price: 11_000_000, x: 0.44, y: 0.50 },
]

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

const DOC_NAMES: Array<[PropertyDocument['category'], string]> = [
  ['title', 'Land title (Mailo) — certified copy.pdf'],
  ['insurance', 'Property insurance 2026.pdf'],
  ['compliance', 'KCCA trading licence.pdf'],
  ['inspection', 'Annual condition survey.pdf'],
  ['lease', 'Signed tenancy agreement.pdf'],
  ['compliance', 'URA rental income tax clearance.pdf'],
]

function makeDocs(prefix: string, count: number): PropertyDocument[] {
  const out: PropertyDocument[] = []
  for (let i = 0; i < count; i++) {
    const [category, name] = DOC_NAMES[i % DOC_NAMES.length]
    out.push({
      id: `${prefix}-doc-${i + 1}`,
      name,
      category,
      sizeKb: intBetween(120, 4800),
      uploadedAt: dayOffset(-intBetween(20, 900)),
      uploadedBy: pick(TEAM).name,
    })
  }
  return out
}

/** Roads that actually run through each area, so an address never places a
 *  Kololo avenue in Ntinda. */
/** Not everything Altier manages is inside Kampala — Entebbe is its own
 *  municipality, and the northern suburbs fall under Wakiso district. */
const CITIES: Record<string, string> = {
  Entebbe: 'Entebbe',
  Lubowa: 'Wakiso',
  Najjera: 'Wakiso',
  Kira: 'Wakiso',
  Kyanja: 'Wakiso',
  Namanve: 'Mukono',
}

const ROADS: Record<string, string[]> = {
  Kololo: ['Acacia Avenue', 'Lower Kololo Terrace', 'Prince Charles Drive', 'John Babiiha Avenue', 'Wampewo Avenue'],
  Nakasero: ['Nakasero Road', 'Kyadondo Road', 'Nakasero Hill Road', 'Kitante Road'],
  Central: ['Kampala Road', 'Ben Kiwanuka Street', 'William Street'],
  'Old Kampala': ['Old Kampala Road', 'Mengo Hill Road', 'Namirembe Road'],
  Bugolobi: ['Luthuli Avenue', 'Bandali Rise', 'Spring Road'],
  Muyenga: ['Tank Hill Road', 'Muyenga Ring Road'],
  Kansanga: ['Ggaba Road', 'Kansanga Ring Road'],
  Munyonyo: ['Ggaba Road', 'Munyonyo Road'],
  Ntinda: ['Ntinda Road', 'Kiwatule Road', 'Stretcher Road'],
  Naguru: ['Naguru Hill Drive', 'Bukoto–Naguru Road'],
  Bukoto: ['Bukoto Street', 'Kisaasi Road'],
  Nsambya: ['Nsambya Road', 'Gaba Road', 'Queens Way'],
  Mbuya: ['Mbuya Hill Road', 'Old Portbell Road'],
  Najjera: ['Najjera Road', 'Buwate Road'],
  Kira: ['Kira Road', 'Bulindo Road'],
  Kyanja: ['Kyanja Road', 'Kungu Road'],
  Entebbe: ['Circular Road', 'Berkeley Road', 'Nsamizi Road'],
  Lubowa: ['Entebbe Road', 'Lubowa Estate Road'],
  Namanve: ['Jinja Road', 'Namanve Industrial Park Road'],
}

const MAINT_NOTES = [
  'Water tank cleaned and chlorinated — next due in six months.',
  'Generator serviced; oil and filters replaced.',
  'Repainted the compound wall after the rains.',
  'Gate motor lubricated; monitor after the next tenant change.',
  'Kitchen extractor replaced; receipt filed under documents.',
  'Roof gutters cleared ahead of the rainy season.',
  'Borehole yield tested — within normal range.',
]

export const PROPERTIES: Property[] = SEEDS.map((s, i) => {
  const id = `p-${String(i + 1).padStart(2, '0')}`
  const commercial = s.type === 'commercial'
  const pool = commercial ? COMMERCIAL_AMENITIES : AMENITY_POOL
  const amenities = [...pool].sort(() => rnd() - 0.5).slice(0, intBetween(5, 9))

  const availableFrom =
    s.status === 'available'
      ? dayOffset(-intBetween(2, 40))
      : s.status === 'occupied'
        ? chance(0.35) ? dayOffset(intBetween(6, 70)) : null
        : s.status === 'reserved'
          ? dayOffset(intBetween(3, 24))
          : s.status === 'maintenance'
            ? dayOffset(intBetween(5, 30))
            : null

  const history = Array.from({ length: intBetween(1, 4) }, (_, h) => {
    const back = 180 * (h + 1) + intBetween(0, 90)
    const from = dayOffset(-back)
    const to = dayOffset(-(back - intBetween(120, 175)))
    return {
      id: `${id}-h${h}`,
      clientName: pick(TENANT_NAMES),
      from,
      to,
      mode: s.mode,
      revenue: Math.round(s.price * (s.mode === 'long_term' ? intBetween(5, 12) : intBetween(40, 120))),
    }
  })

  return {
    id,
    code: `ALT-${String(i + 1).padStart(3, '0')}`,
    name: s.name,
    type: s.type,
    mode: s.mode,
    status: s.status,
    address: {
      line1: `Plot ${intBetween(2, 180)}, ${pick(ROADS[s.district] ?? [`${s.district} Road`])}`,
      district: s.district,
      city: CITIES[s.district] ?? 'Kampala',
      country: 'Uganda',
      x: s.x,
      y: s.y,
    },
    bedrooms: s.beds,
    bathrooms: s.baths,
    sizeSqm: s.sqm,
    amenities,
    price: s.price,
    currency: 'UGX',
    managerId: s.mode === 'short_stay' ? 'tm-03' : commercial ? 'tm-04' : MANAGERS[i % MANAGERS.length],
    rating: Number(between(4.1, 5).toFixed(1)),
    availableFrom,
    acquiredOn: dayOffset(-intBetween(400, 2600)),
    yieldPct: Number(between(3.8, 9.4).toFixed(1)),
    notes: pick([
      'Long-standing NGO and mission demand in this block — renewals rarely lapse.',
      'Highest review scores in the portfolio; protect the turnover window.',
      'Owner prefers 24 months minimum on any new lease.',
      'Consider a rent review at renewal — currently 8% under market.',
      'Tenant pays six months up front; diary the next collection early.',
      'Street-level unit: footfall supports a premium at renewal.',
    ]),
    photoSeed: i * 37 + 11,
    documents: makeDocs(id, intBetween(3, 6)),
    occupancyHistory: history,
    maintenanceNotes: [...MAINT_NOTES].sort(() => rnd() - 0.5).slice(0, intBetween(2, 4)),
  }
})

/* ------------------------------ clients --------------------------- */
const CORPORATES = [
  'Nile Capital Partners', 'Rwenzori Consulting Group', 'Pearl Logistics Uganda',
  'Kampala Impact Foundation', 'Equator Semiconductor', 'Ssebugwawo & Co. Advocates',
]
const NATIONALITIES = ['Ugandan', 'Ugandan', 'Ugandan', 'Kenyan', 'Rwandan', 'Tanzanian', 'British', 'German', 'Indian', 'Dutch', 'American', 'Norwegian', 'Nigerian', 'South Sudanese']

const COMM_SUBJECTS: Array<[string, string]> = [
  ['Rent confirmation for this month', 'Sent by mobile money this morning, reference ends 4471. Could you confirm receipt?'],
  ['Request to extend the tenancy', 'We would like to continue on the same terms if possible.'],
  ['Water not reaching the upstairs tank', 'It runs fine downstairs but the upper floor is dry by midday.'],
  ['Early check-in possible?', 'Our flight lands at Entebbe 09:40 — any chance of dropping bags before the room is ready?'],
  ['Gate remote not working', 'The remote stopped opening the gate yesterday evening.'],
  ['Notice of departure', 'Giving formal notice as agreed — happy to allow viewings from next week.'],
  ['Deposit refund timeline', 'Just checking when the deposit is scheduled to be released.'],
  ['Thank you — wonderful stay', 'The apartment was immaculate and Patience was incredibly helpful throughout.'],
]

export const CLIENTS: Client[] = (() => {
  const out: Client[] = []
  TENANT_NAMES.forEach((name, i) => {
    const id = `c-${String(i + 1).padStart(2, '0')}`
    const kind: Client['kind'] = i % 9 === 4 ? 'corporate' : i % 3 === 1 ? 'guest' : 'tenant'
    const display = kind === 'corporate' ? CORPORATES[i % CORPORATES.length] : name
    const comms = Array.from({ length: intBetween(2, 6) }, (_, k) => {
      const [subject, preview] = COMM_SUBJECTS[(i + k) % COMM_SUBJECTS.length]
      return {
        id: `${id}-cm-${k}`,
        channel: pick(['email', 'call', 'sms', 'portal', 'note'] as const),
        direction: chance(0.6) ? ('inbound' as const) : ('outbound' as const),
        subject,
        preview,
        at: dayOffset(-intBetween(1, 120)),
        author: chance(0.6) ? display : pick(TEAM).name,
      }
    }).sort((a, b) => (a.at < b.at ? 1 : -1))

    out.push({
      id,
      name: display,
      kind,
      email: `${display.toLowerCase().replace(/[^a-z ]/g, '').split(' ').slice(0, 2).join('.')}@${kind === 'corporate' ? 'corp.example.com' : 'mail.example.com'}`,
      phone: `+256 7${pick(['0', '5', '7'])}${intBetween(1, 9)} ${intBetween(100, 999)} ${intBetween(100, 999)}`,
      nationality: pick(NATIONALITIES),
      since: dayOffset(-intBetween(40, 1400)),
      status: i > 23 ? 'past' : i === 22 ? 'prospect' : 'active',
      propertyIds: [],
      idDocuments: makeDocs(id, intBetween(1, 3)).map((d) => ({
        ...d,
        category: 'id' as const,
        name: pick(['National ID (NIN) scan.pdf', 'Passport scan.pdf', 'Proof of address — utility bill.pdf', 'Employment letter.pdf', 'Company registration (URSB).pdf']),
      })),
      notes: pick([
        'Prefers written communication; responds quickly by email.',
        'Excellent payment record across three tenancies.',
        'Relocation package handled by employer — invoices go to accounts payable.',
        'Requested a unit away from the main road.',
        'Pays six months in advance each cycle without prompting.',
        'Repeat guest — fourth stay with Altier.',
      ]),
      emergencyContact: `${pick(TENANT_NAMES)} · +256 7${pick(['0', '5', '7'])}${intBetween(1, 9)} ${intBetween(100, 999)} ${intBetween(100, 999)}`,
      communications: comms,
      lifetimeValue: intBetween(12_000_000, 420_000_000),
      rating: Number(between(3.9, 5).toFixed(1)),
    })
  })
  return out
})()

/* ----------------------------- bookings --------------------------- */
const SOURCES: BookingSource[] = ['direct', 'airbnb', 'booking_com', 'agency', 'corporate']

export const BOOKINGS: Booking[] = (() => {
  const out: Booking[] = []
  let n = 0
  const activeClients = CLIENTS.filter((c) => c.status !== 'past')
  const addMonths = (from: string, months: number) => {
    const d = new Date(from + 'T00:00:00')
    d.setMonth(d.getMonth() + months)
    return iso(d)
  }

  PROPERTIES.forEach((p, pi) => {
    const attach = (clientIdx: number) => {
      const c = activeClients[clientIdx % activeClients.length]
      if (!c.propertyIds.includes(p.id)) c.propertyIds.push(p.id)
      return c
    }

    /* ---------------- Fixed-term lease: a start and an end ------------- */
    if (p.mode === 'long_term') {
      if (p.status === 'occupied' || p.status === 'maintenance') {
        const c = attach(pi)
        const months = pick([12, 12, 18, 24, 36])
        const elapsed = intBetween(30, months * 30 - 45)
        const start = dayOffset(-elapsed)
        out.push({
          id: `b-${++n}`, reference: `LSE-${2600 + n}`, propertyId: p.id, clientId: c.id,
          mode: 'long_term', status: 'in_progress',
          start, end: addMonths(start, months), rate: p.price, deposit: p.price * 2,
          advanceMonths: 1, paidThrough: null, noticeDays: 60,
          guests: Math.max(1, p.bedrooms), source: pick(['direct', 'agency', 'corporate']),
          checkIn: '14:00', checkOut: '11:00',
          notes: 'Standard 60-day renewal notice window.', createdAt: dayOffset(-(elapsed + intBetween(14, 60))),
        })
      }
      if (p.status === 'reserved') {
        const c = attach(pi + 5)
        const start = dayOffset(intBetween(4, 30))
        out.push({
          id: `b-${++n}`, reference: `LSE-${2600 + n}`, propertyId: p.id, clientId: c.id,
          mode: 'long_term', status: 'upcoming', start, end: addMonths(start, 12),
          rate: p.price, deposit: p.price * 2, advanceMonths: 1, paidThrough: null, noticeDays: 60,
          guests: Math.max(1, p.bedrooms), source: 'agency', checkIn: '14:00', checkOut: '11:00',
          notes: 'Deposit received; keys released on move-in day.', createdAt: dayOffset(-intBetween(5, 25)),
        })
      }
      return
    }

    /* -------- Open-ended rental: rolling until the tenant gives notice --
       Several months are taken up front, so the tenancy cannot collapse
       after one or two months and leave the owner re-letting at no notice. */
    if (p.mode === 'rental') {
      if (p.status === 'occupied' || p.status === 'maintenance') {
        const c = attach(pi)
        const advanceMonths = pick([3, 3, 3, 6, 6, 12])
        /* Most rentals are well established, so several payment cycles fall
           inside the last twelve months; a minority are newly signed. */
        const elapsed = chance(0.25) ? intBetween(10, 40) : intBetween(200, 900)
        const start = dayOffset(-elapsed)
        /* Rent is covered to the end of the last cycle the tenant paid for.
           Most are a cycle ahead; a minority have let one lapse. */
        let cycles = 0
        while (addMonths(start, (cycles + 1) * advanceMonths) <= iso(TODAY) && cycles < 60) cycles++
        const paidCycles = chance(0.25) ? cycles : cycles + 1
        const paidThrough = addMonths(start, paidCycles * advanceMonths)
        out.push({
          id: `b-${++n}`, reference: `RNT-${4800 + n}`, propertyId: p.id, clientId: c.id,
          mode: 'rental', status: 'in_progress', start, end: null,
          rate: p.price, deposit: p.price, advanceMonths, paidThrough,
          noticeDays: pick([30, 30, 60]),
          guests: Math.max(1, p.bedrooms), source: pick(['direct', 'direct', 'agency']),
          checkIn: '12:00', checkOut: '12:00',
          notes: `Pays ${advanceMonths} months at a time; the cycle repeats for as long as the tenancy runs.`,
          createdAt: dayOffset(-(elapsed + intBetween(7, 30))),
        })
      }
      if (p.status === 'reserved') {
        const c = attach(pi + 5)
        const advanceMonths = pick([3, 3, 6])
        const start = dayOffset(intBetween(4, 26))
        out.push({
          id: `b-${++n}`, reference: `RNT-${4800 + n}`, propertyId: p.id, clientId: c.id,
          mode: 'rental', status: 'upcoming', start, end: null,
          rate: p.price, deposit: p.price, advanceMonths,
          /* Nothing is covered until the first cycle actually clears. */
          paidThrough: null, noticeDays: 30,
          guests: Math.max(1, p.bedrooms), source: 'direct', checkIn: '12:00', checkOut: '12:00',
          notes: `First ${advanceMonths}-month advance invoiced; keys released once it clears.`,
          createdAt: dayOffset(-intBetween(4, 20)),
        })
      }
      return
    }

    /* ---------------- Short stays: nightly, in and out ----------------- */
    const windows: Array<{ from: number; to: number; state: Booking['status'] }> = []
    /* A year of completed stays, so a twelve-month revenue chart is not
       measuring how recently the data was generated. */
    let cursor = -intBetween(330, 370)
    const pastCount = p.status === 'inactive' ? 4 : intBetween(14, 22)
    for (let k = 0; k < pastCount; k++) {
      const nights = intBetween(2, p.type === 'villa' ? 10 : 6)
      if (cursor + nights >= -3) break
      windows.push({ from: cursor, to: cursor + nights, state: 'completed' })
      cursor = cursor + nights + intBetween(4, 18)
    }
    if (p.status === 'occupied') {
      const nights = intBetween(3, p.type === 'villa' ? 12 : 8)
      const from = -intBetween(1, Math.max(1, nights - 2))
      windows.push({ from, to: from + nights, state: 'in_progress' })
      cursor = from + nights + intBetween(2, 6)
    } else if (p.status === 'reserved') {
      const from = intBetween(3, 14)
      windows.push({ from, to: from + intBetween(3, 9), state: 'upcoming' })
      cursor = from + 12
    } else {
      cursor = Math.max(cursor, intBetween(4, 20))
    }
    if (p.status !== 'inactive' && p.status !== 'maintenance') {
      const forward = intBetween(2, 4)
      for (let k = 0; k < forward; k++) {
        const nights = intBetween(2, p.type === 'villa' ? 10 : 6)
        const from = Math.max(cursor, 2)
        windows.push({ from, to: from + nights, state: chance(0.15) ? 'pending' : 'upcoming' })
        cursor = from + nights + intBetween(3, 16)
      }
    }
    windows.forEach((w, k) => {
      const c = attach(pi + k * 3)
      out.push({
        id: `b-${++n}`, reference: `STY-${7100 + n}`, propertyId: p.id, clientId: c.id,
        mode: 'short_stay', status: w.state, start: dayOffset(w.from), end: dayOffset(w.to),
        rate: p.price, deposit: Math.round(p.price * 1.5), advanceMonths: 0,
        paidThrough: null, noticeDays: 0,
        guests: intBetween(1, Math.max(2, p.bedrooms * 2)), source: pick(SOURCES),
        checkIn: '15:00', checkOut: '11:00',
        notes: pick(['Self check-in via smart lock.', 'Early check-in requested.', 'Cot requested for infant.', 'Airport transfer arranged.', 'Late checkout approved (13:00).']),
        createdAt: dayOffset(w.from - intBetween(8, 60)),
      })
    })
  })

  // One cancellation makes the pipeline believable — never a live or past stay
  const cancellable = out.findIndex((b) => b.status === 'upcoming' && b.mode === 'short_stay')
  if (cancellable >= 0) out[cancellable] = { ...out[cancellable], status: 'cancelled', notes: 'Guest cancelled — within the free-cancellation window.' }
  return out
})()

/* ---------------------------- invoices ---------------------------- */
export const INVOICES: Invoice[] = (() => {
  const out: Invoice[] = []
  let n = 4200

  /* Unless a charge says otherwise it pays for the month it falls due in. */
  const push = (
    v: Omit<Invoice, 'id' | 'number' | 'earnsFrom' | 'earnsTo'> & { earnsFrom?: string; earnsTo?: string },
  ) => {
    n++
    const earnsFrom = v.earnsFrom ?? `${v.dueOn.slice(0, 7)}-01`
    const earnsTo = v.earnsTo ?? addMonths(earnsFrom, 1)
    out.push({ ...v, earnsFrom, earnsTo, id: `i-${n}`, number: `ALT-INV-${n}` })
  }

  const addMonths = (from: string, months: number) => {
    const d = new Date(from + 'T00:00:00')
    d.setMonth(d.getMonth() + months)
    return iso(d)
  }
  const today = iso(TODAY)

  BOOKINGS.forEach((b) => {
    const p = PROPERTIES.find((x) => x.id === b.propertyId)!
    if (b.status === 'cancelled') return

    /* Open-ended rental: rent is paid a cycle at a time — three, six or
       twelve months — and the cycle repeats for as long as the tenancy
       runs. Each payment buys `advanceMonths` of occupation starting at its
       own due date, so one month of it is earned immediately and the rest
       is deferred. */
    if (b.mode === 'rental') {
      push({
        propertyId: p.id, clientId: b.clientId, bookingId: b.id, type: 'deposit',
        issuedOn: iso(addDays(b.start, -12)), dueOn: iso(addDays(b.start, -3)),
        amount: b.deposit, paidAmount: b.deposit, status: 'paid',
        method: 'mobile_money', paidOn: iso(addDays(b.start, -4)),
        memo: 'Refundable security deposit — held in client account',
      })

      const cycle = Math.max(1, b.advanceMonths)
      const covered = b.paidThrough ?? b.start
      const horizon = dayOffset(75)
      let cursor = b.start
      let guard = 0
      while (cursor <= horizon && guard++ < 60) {
        const isPaid = cursor < covered
        const gap = daysBetween(today, cursor)
        const status: Invoice['status'] = isPaid
          ? 'paid'
          : gap < 0 ? 'overdue' : gap <= 7 ? 'pending' : 'upcoming'
        const until = addMonths(cursor, cycle)
        push({
          propertyId: p.id, clientId: b.clientId, bookingId: b.id, type: 'advance',
          issuedOn: iso(addDays(cursor, -12)), dueOn: cursor,
          amount: p.price * cycle, earnsFrom: cursor, earnsTo: until,
          paidAmount: isPaid ? p.price * cycle : 0, status,
          method: isPaid ? pick(['mobile_money', 'mobile_money', 'bank_transfer', 'cash']) : null,
          paidOn: isPaid ? iso(addDays(cursor, intBetween(0, 4))) : null,
          memo: `${cycle} months rent in advance · ${new Date(cursor + 'T00:00:00').toLocaleString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(addMonths(cursor, cycle - 1) + 'T00:00:00').toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`,
        })
        cursor = until
      }
      return
    }

    if (b.mode === 'long_term' && b.end) {
      // Twelve monthly rent charges around today
      for (let m = -11; m <= 3; m++) {
        const due = iso(addDays(new Date(TODAY.getFullYear(), TODAY.getMonth() + m, 1), 0))
        if (due < b.start || due > b.end) continue
        const overdueRoll = rnd()
        const isFuture = due > iso(TODAY)
        const recent = m >= -2
        const status: Invoice['status'] = isFuture
          ? m === 0 ? 'pending' : 'upcoming'
          : recent && overdueRoll < 0.16 ? 'overdue'
            : recent && overdueRoll < 0.22 ? 'partial'
              : 'paid'
        const paidAmount = status === 'paid' ? p.price : status === 'partial' ? Math.round(p.price * 0.45) : 0
        push({
          propertyId: p.id, clientId: b.clientId, bookingId: b.id, type: 'rent',
          issuedOn: iso(addDays(due, -10)), dueOn: due, amount: p.price, paidAmount, status,
          method: paidAmount ? pick(['bank_transfer', 'bank_transfer', 'card', 'mobile_money']) : null,
          paidOn: status === 'paid' ? iso(addDays(due, intBetween(0, 6))) : status === 'partial' ? iso(addDays(due, 3)) : null,
          memo: `Monthly rent — ${new Date(due + 'T00:00:00').toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`,
        })
      }
      push({
        propertyId: p.id, clientId: b.clientId, bookingId: b.id, type: 'deposit',
        issuedOn: iso(addDays(b.start, -14)), dueOn: iso(addDays(b.start, -7)),
        amount: b.deposit, paidAmount: b.deposit, status: 'paid', method: 'bank_transfer',
        paidOn: iso(addDays(b.start, -8)), memo: 'Security deposit — held in client account',
      })
    } else {
      const nights = Math.max(1, daysBetween(b.start, b.end ?? b.start))
      const total = nights * b.rate
      const due = iso(addDays(b.start, -3))
      const past = due <= iso(TODAY)
      const roll = rnd()
      const status: Invoice['status'] = !past
        ? 'upcoming'
        : b.status === 'pending' ? 'pending' : roll < 0.08 ? 'overdue' : 'paid'
      push({
        propertyId: p.id, clientId: b.clientId, bookingId: b.id, type: 'booking',
        issuedOn: iso(addDays(b.start, -10)), dueOn: due, amount: total,
        earnsFrom: b.start, earnsTo: b.end ?? iso(addDays(b.start, nights)),
        paidAmount: status === 'paid' ? total : 0, status,
        method: status === 'paid' ? pick(['card', 'card', 'bank_transfer']) : null,
        paidOn: status === 'paid' ? iso(addDays(due, -intBetween(0, 3))) : null,
        memo: `${nights} night${nights > 1 ? 's' : ''} · ${b.source === 'airbnb' ? 'Airbnb' : b.source === 'booking_com' ? 'Booking.com' : 'Direct'} booking`,
      })
    }
  })

  // A handful of ancillary charges
  for (let k = 0; k < 14; k++) {
    const p = pick(PROPERTIES)
    const c = pick(CLIENTS.filter((x) => x.status === 'active'))
    const type = pick(['utilities', 'service_fee', 'late_fee', 'maintenance_recharge'] as const)
    const offset = intBetween(-45, 30)
    const due = dayOffset(offset)
    const amount = type === 'late_fee' ? intBetween(100_000, 500_000) : intBetween(150_000, 2_500_000)
    const status: Invoice['status'] = offset > 0 ? 'upcoming' : offset > -50 && rnd() < 0.3 ? 'overdue' : 'paid'
    push({
      propertyId: p.id, clientId: c.id, bookingId: null, type,
      issuedOn: dayOffset(offset - 12), dueOn: due, amount,
      paidAmount: status === 'paid' ? amount : 0, status,
      method: status === 'paid' ? pick(['bank_transfer', 'card', 'cash']) : null,
      paidOn: status === 'paid' ? dayOffset(offset + intBetween(0, 5)) : null,
      memo: {
        utilities: 'Utilities recharge — water & common area electricity',
        service_fee: 'Management service fee',
        late_fee: 'Late payment fee per clause 8.2',
        maintenance_recharge: 'Tenant-liable repair recharge',
      }[type],
    })
  }

  /* A property does not begin earning the day its current tenant moved in.
     Fill the months before that with the previous tenancy's rent, so a
     twelve-month chart shows the portfolio's shape rather than the age of
     its newest agreements. */
  const pastClients = CLIENTS.filter((c) => c.status === 'past')
  PROPERTIES.forEach((p, pi) => {
    if (p.mode === 'short_stay' || p.status === 'inactive') return
    const live = BOOKINGS.find(
      (b) => b.propertyId === p.id && (b.status === 'in_progress' || b.status === 'upcoming'),
    )
    const earningUntil = live ? live.start : p.availableFrom ?? iso(TODAY)
    const priorClient = pastClients[pi % Math.max(1, pastClients.length)]
    if (!priorClient) return
    const priorRent = Math.round(p.price * 0.92)
    for (let m = -11; m <= 0; m++) {
      const due = iso(new Date(TODAY.getFullYear(), TODAY.getMonth() + m, 1))
      if (due >= earningUntil) continue
      push({
        propertyId: p.id, clientId: priorClient.id, bookingId: null, type: 'rent',
        issuedOn: iso(addDays(due, -10)), dueOn: due, amount: priorRent,
        paidAmount: priorRent, status: 'paid',
        method: pick(['mobile_money', 'bank_transfer', 'cash']),
        paidOn: iso(addDays(due, intBetween(0, 5))),
        memo: `Monthly rent — ${new Date(due + 'T00:00:00').toLocaleString('en-GB', { month: 'long', year: 'numeric' })} · previous tenancy`,
      })
    }
  })

  /* Nothing can be settled on a date that has not happened yet. An advance
     or deposit attached to an agreement that starts next month is money
     still to collect, not revenue — otherwise it inflates this month's
     collections and the month-on-month comparison with it. */
  out.forEach((inv) => {
    if (inv.paidOn && inv.paidOn > today) {
      inv.status = daysBetween(today, inv.dueOn) <= 7 ? 'pending' : 'upcoming'
      inv.paidAmount = 0
      inv.paidOn = null
      inv.method = null
    }
  })

  /* Anything falling due inside the next week is "pending", not merely
     "upcoming" — that is the bucket a manager actually works from. */
  out.forEach((inv) => {
    if (inv.status !== 'upcoming') return
    const gap = daysBetween(today, inv.dueOn)
    if (gap >= 0 && gap <= 7) inv.status = 'pending'
  })

  return out.sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1))
})()

/* --------------------------- maintenance -------------------------- */
const MAINT_TEMPLATES: Array<{ title: string; cat: MaintenanceRequest['category']; desc: string; trade: string }> = [
  { title: 'Water not reaching the roof tank', cat: 'plumbing', desc: 'Booster pump cutting out; the upper floor is dry by mid-morning.', trade: 'Plumbing' },
  { title: 'Standby generator failing to start', cat: 'electrical', desc: 'Does not crank during load-shedding. Battery and fuel solenoid to be checked.', trade: 'Generator' },
  { title: 'Consumer unit tripping on the kitchen ring', cat: 'electrical', desc: 'RCD trips intermittently. Full circuit test required.', trade: 'Electrical' },
  { title: 'Water heater not heating', cat: 'appliance', desc: 'Element suspected. Unit is four years old and out of warranty.', trade: 'Appliance' },
  { title: 'Balcony railing loose at fixing', cat: 'safety', desc: 'Two anchor bolts have worked loose. Safety priority — restrict access until fixed.', trade: 'Metalwork' },
  { title: 'Deep clean before next check-in', cat: 'cleaning', desc: 'Standard turnover plus oven and grout treatment. Linen refresh included.', trade: 'Housekeeping' },
  { title: 'Roof leak above the back bedroom', cat: 'structural', desc: 'Appeared with the March rains. Iron sheets and flashing to be inspected.', trade: 'Roofing' },
  { title: 'Compound overgrown before viewing', cat: 'grounds', desc: 'Hedge cut back, lawn cut and drive cleared ahead of Thursday viewings.', trade: 'Grounds' },
  { title: 'Split AC units due for service', cat: 'hvac', desc: 'Annual service, gas top-up and filter change across three units.', trade: 'Air conditioning' },
  { title: 'Automatic gate motor failing', cat: 'safety', desc: 'Sticking halfway. Security risk overnight — treat as priority.', trade: 'Gate automation' },
  { title: 'Septic tank due for emptying', cat: 'structural', desc: 'Last emptied eleven months ago. Cesspool truck to be booked.', trade: 'Sanitation' },
  { title: 'Borehole pump losing pressure', cat: 'plumbing', desc: 'Yield down noticeably since last month. Pump and pressure switch to check.', trade: 'Borehole' },
]
const VENDORS = [
  'Kizza & Sons Contractors', 'Nile Facilities Services', 'Bwaise Electrical Works',
  'Pearl Clean Kampala', 'Rwenzori Plumbing', 'Kampala Lift & Gate Care',
  'Bugolobi Generator Services', 'Green Compound Landscaping',
]

export const MAINTENANCE: MaintenanceRequest[] = (() => {
  const out: MaintenanceRequest[] = []
  for (let k = 0; k < 22; k++) {
    const t = MAINT_TEMPLATES[k % MAINT_TEMPLATES.length]
    const p = PROPERTIES[(k * 5 + 3) % PROPERTIES.length]
    const reportedOffset = -intBetween(1, 60)
    const dueOffset = reportedOffset + intBetween(3, 28)
    const priority = t.cat === 'safety' ? (chance(0.6) ? 'urgent' : 'high') : pick(['low', 'medium', 'medium', 'high', 'urgent'] as const)
    const status: MaintenanceRequest['status'] =
      dueOffset < -3 ? (chance(0.75) ? 'completed' : 'awaiting_parts')
        : pick(['reported', 'scheduled', 'scheduled', 'in_progress', 'in_progress', 'awaiting_parts', 'completed'] as const)
    const estimated = intBetween(200_000, 8_000_000)
    const completed = status === 'completed'
    const reportedOn = dayOffset(reportedOffset)
    const timeline: MaintenanceRequest['timeline'] = [
      { at: reportedOn, label: 'Request logged', by: pick(TEAM).name },
      { at: dayOffset(reportedOffset + 1), label: 'Triaged and priority set', by: 'Rui Castellan' },
    ]
    if (status !== 'reported') timeline.push({ at: dayOffset(reportedOffset + 2), label: 'Vendor assigned and scheduled', by: 'Nuno Ferreira' })
    if (status === 'in_progress' || completed) timeline.push({ at: dayOffset(reportedOffset + 4), label: 'Work started on site', by: pick(VENDORS) })
    if (status === 'awaiting_parts') timeline.push({ at: dayOffset(reportedOffset + 4), label: 'Parts ordered — 5 day lead time', by: pick(VENDORS) })
    if (completed) timeline.push({ at: dayOffset(dueOffset - 1), label: 'Completed and signed off', by: 'Nuno Ferreira' })

    out.push({
      id: `m-${k + 1}`,
      reference: `MNT-${3300 + k}`,
      propertyId: p.id,
      title: t.title,
      description: t.desc,
      category: t.cat,
      priority,
      status,
      vendor: pick(VENDORS),
      trade: t.trade,
      assigneeId: pick(['tm-06', 'tm-06', 'tm-07', 'tm-02']),
      reportedBy: chance(0.5) ? pick(CLIENTS).name : pick(TEAM).name,
      reportedOn,
      dueOn: dayOffset(dueOffset),
      completedOn: completed ? dayOffset(dueOffset - 1) : null,
      estimatedCost: estimated,
      actualCost: completed ? Math.round(estimated * between(0.82, 1.24)) : null,
      timeline,
    })
  }
  return out
})()

/* --------------------------- preferences -------------------------- */
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
export function buildNotifications(
  properties: Property[],
  invoices: Invoice[],
  bookings: Booking[],
  maintenance: MaintenanceRequest[],
  clients: Client[],
  reminders: ReminderSettings,
): AppNotification[] {
  const today = iso(TODAY)
  const out: AppNotification[] = []
  const nameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? 'Property'
  const clientOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Client'

  invoices.forEach((inv) => {
    const gap = daysBetween(today, inv.dueOn)
    if (inv.status === 'overdue') {
      out.push({
        id: `n-inv-${inv.id}`, kind: 'payment_overdue', priority: Math.abs(gap) > 14 ? 'critical' : 'high',
        title: `Payment overdue · ${formatMoney(inv.amount - inv.paidAmount)}`,
        body: `${clientOf(inv.clientId)} — ${nameOf(inv.propertyId)}. ${Math.abs(gap)} days past due on ${inv.number}.`,
        createdAt: inv.dueOn, read: false, entity: { type: 'invoice', id: inv.id }, actionLabel: 'Chase payment',
      })
    } else if ((inv.status === 'pending' || inv.status === 'upcoming') && gap >= 0 && gap <= reminders.rentDueLeadDays) {
      out.push({
        id: `n-inv-${inv.id}`, kind: 'payment_due', priority: gap <= 1 ? 'high' : 'normal',
        title: `${inv.type === 'rent' ? 'Rent' : 'Payment'} due ${gap === 0 ? 'today' : `in ${gap} day${gap > 1 ? 's' : ''}`}`,
        body: `${formatMoney(inv.amount)} from ${clientOf(inv.clientId)} for ${nameOf(inv.propertyId)}.`,
        createdAt: dayOffset(-Math.max(0, reminders.rentDueLeadDays - gap)), read: false,
        entity: { type: 'invoice', id: inv.id }, actionLabel: 'Send reminder',
      })
    } else if (inv.status === 'partial') {
      out.push({
        id: `n-inv-${inv.id}`, kind: 'payment_due', priority: 'normal',
        title: `Part payment received · ${formatMoney(inv.paidAmount)} of ${formatMoney(inv.amount)}`,
        body: `${clientOf(inv.clientId)} — balance of ${formatMoney(inv.amount - inv.paidAmount)} outstanding on ${inv.number}.`,
        createdAt: inv.dueOn, read: false, entity: { type: 'invoice', id: inv.id }, actionLabel: 'Review balance',
      })
    }
  })

  bookings.forEach((b) => {
    const inDays = daysBetween(today, b.start)
    const outDays = b.end ? daysBetween(today, b.end) : Number.POSITIVE_INFINITY
    if (b.status === 'upcoming' && inDays >= 0 && inDays <= 3) {
      out.push({
        id: `n-in-${b.id}`, kind: 'check_in', priority: inDays === 0 ? 'high' : 'normal',
        title: `Check-in ${inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`} · ${b.checkIn}`,
        body: `${clientOf(b.clientId)} arriving at ${nameOf(b.propertyId)} · ${b.guests} guest${b.guests > 1 ? 's' : ''} · ${b.reference}.`,
        createdAt: dayOffset(-1), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Prepare arrival',
      })
    }
    if (b.status === 'in_progress' && b.mode === 'short_stay' && outDays >= 0 && outDays <= 2) {
      out.push({
        id: `n-out-${b.id}`, kind: 'check_out', priority: 'normal',
        title: `Check-out ${outDays === 0 ? 'today' : `in ${outDays} day${outDays > 1 ? 's' : ''}`} · ${b.checkOut}`,
        body: `${nameOf(b.propertyId)} — schedule turnover clean after ${clientOf(b.clientId)} departs.`,
        createdAt: dayOffset(0), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Schedule turnover',
      })
    }
    /* An open-ended rental never expires — what matters is how far the rent
       is paid through, and whether the advance is running down. */
    if (b.mode === 'rental' && b.status === 'in_progress' && b.paidThrough) {
      const covered = daysBetween(today, b.paidThrough)
      if (covered < 0) {
        out.push({
          id: `n-rent-${b.id}`, kind: 'payment_overdue', priority: covered < -21 ? 'critical' : 'high',
          title: `Rent lapsed ${Math.abs(covered)} days ago`,
          body: `${clientOf(b.clientId)} at ${nameOf(b.propertyId)} is occupying beyond the paid period. Advance was ${b.advanceMonths} months at move-in.`,
          createdAt: b.paidThrough, read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Chase rent',
        })
      } else if (covered <= reminders.rentDueLeadDays * 3) {
        out.push({
          id: `n-rent-${b.id}`, kind: 'payment_due', priority: covered <= 7 ? 'high' : 'normal',
          title: `Rent covered for ${covered} more day${covered === 1 ? '' : 's'}`,
          body: `${clientOf(b.clientId)} at ${nameOf(b.propertyId)} is paid through ${b.paidThrough}. Collect the next month before it lapses.`,
          createdAt: dayOffset(-1), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Request rent',
        })
      }
    }

    if (b.mode === 'long_term' && b.status === 'in_progress' && b.end) {
      const expiry = daysBetween(today, b.end)
      if (expiry >= 0 && expiry <= reminders.leaseExpiryLeadDays) {
        out.push({
          id: `n-lease-${b.id}`, kind: 'lease_expiry', priority: expiry <= 21 ? 'high' : 'normal',
          title: `Lease expires in ${expiry} days`,
          body: `${clientOf(b.clientId)} at ${nameOf(b.propertyId)} — decide on renewal or start re-marketing.`,
          createdAt: dayOffset(-2), read: false, entity: { type: 'booking', id: b.id }, actionLabel: 'Open renewal',
        })
      }
    }
  })

  properties.forEach((p) => {
    if (p.status === 'available' && p.availableFrom) {
      const vacantFor = Math.abs(daysBetween(p.availableFrom, today))
      if (vacantFor >= reminders.vacancyAlertDays) {
        out.push({
          id: `n-vac-${p.id}`, kind: 'vacancy', priority: vacantFor > 30 ? 'high' : 'normal',
          title: `Vacant ${vacantFor} days · ${formatMoney(p.mode === 'short_stay' ? p.price * 30 : p.price)} monthly exposure`,
          body: `${p.name} in ${p.address.district} has had no booking since ${p.availableFrom}.`,
          createdAt: dayOffset(-1), read: false, entity: { type: 'property', id: p.id }, actionLabel: 'Review listing',
        })
      }
    }
  })

  maintenance.forEach((m) => {
    if (m.status === 'completed') return
    const gap = daysBetween(today, m.dueOn)
    if (gap <= reminders.maintenanceLeadDays) {
      out.push({
        id: `n-mnt-${m.id}`, kind: 'maintenance',
        priority: m.priority === 'urgent' ? 'critical' : gap < 0 ? 'high' : 'normal',
        title: gap < 0 ? `Maintenance ${Math.abs(gap)} days overdue` : `Maintenance due ${gap === 0 ? 'today' : `in ${gap} day${gap > 1 ? 's' : ''}`}`,
        body: `${m.title} — ${nameOf(m.propertyId)} · ${m.vendor}.`,
        createdAt: dayOffset(Math.min(0, gap)), read: false, entity: { type: 'maintenance', id: m.id }, actionLabel: 'Open job',
      })
    }
  })

  /* Nothing is appended here. Every notification above is derived from a
     record that exists, so an empty portfolio produces an empty list —
     which is the honest answer, and the one a new deployment needs. */
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/* ------------------------------ helpers --------------------------- */
/** Notification copy is built from the same presentation settings as the
 *  rest of the UI, so a currency change reaches the alerts too. */
export function formatMoney(n: number) {
  const value = n * presentation.rate
  return new Intl.NumberFormat(presentation.locale, {
    style: 'currency',
    currency: presentation.currency,
    maximumFractionDigits: 0,
  }).format(value)
}
