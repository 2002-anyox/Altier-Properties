import type {
  AppNotification, Booking, BookingSource, Client, Invoice, MaintenanceRequest,
  Property, PropertyDocument, PropertyStatus, PropertyType, ReminderSettings,
  TeamMember, TenancyMode,
} from './types'

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
  { id: 'tm-01', name: 'Amara Vance', role: 'owner', title: 'Founder & Principal', email: 'amara.vance@altier.co', phone: '+351 912 004 118', since: '2018-03-01' },
  { id: 'tm-02', name: 'Rui Castellan', role: 'manager', title: 'Head of Portfolio', email: 'rui.castellan@altier.co', phone: '+351 912 776 240', since: '2019-06-14' },
  { id: 'tm-03', name: 'Ines Moreau', role: 'manager', title: 'Short-Stay Manager', email: 'ines.moreau@altier.co', phone: '+351 913 550 907', since: '2021-01-11' },
  { id: 'tm-04', name: 'Tomas Bekele', role: 'manager', title: 'Commercial Lettings', email: 'tomas.bekele@altier.co', phone: '+351 914 228 601', since: '2020-09-02' },
  { id: 'tm-05', name: 'Sofia Andrade', role: 'accountant', title: 'Financial Controller', email: 'sofia.andrade@altier.co', phone: '+351 915 331 776', since: '2019-11-25' },
  { id: 'tm-06', name: 'Nuno Ferreira', role: 'staff', title: 'Operations & Turnover', email: 'nuno.ferreira@altier.co', phone: '+351 916 118 442', since: '2022-04-19' },
  { id: 'tm-07', name: 'Clara Whitfield', role: 'staff', title: 'Guest Experience', email: 'clara.whitfield@altier.co', phone: '+351 917 640 315', since: '2023-02-06' },
]
const MANAGERS = TEAM.filter((t) => t.role === 'manager').map((t) => t.id)

/* --------------------------- client names -------------------------- */
const TENANT_NAMES = [
  'Helena Duarte', 'Marcus Oyelaran', 'Priya Raghunathan', 'Jonas Lindqvist',
  'Camille Berger', 'Diego Salazar', 'Aisha Bello', 'Tobias Reuter',
  'Noor Haddad', 'Elena Petrova', 'Samuel Achterberg', 'Yuki Tanaka',
  'Rachel Nkemdirim', 'Andrei Munteanu', 'Farah Zaman', 'Lucas Almeida',
  'Isabel Ferrero', 'Kwame Mensah', 'Greta Solheim', 'Mateo Rinaldi',
  'Nadia Bouchard', 'Oliver Ashcroft', 'Zoe Karalis', 'Hassan Qureshi',
  'Marta Kowalska', 'Daniel Osei', 'Chloe Marchetti', 'Ravi Deshmukh',
]

/* ---------------------------- portfolio --------------------------- */
type Seed = {
  name: string; type: PropertyType; mode: TenancyMode; status: PropertyStatus
  district: string; beds: number; baths: number; sqm: number; price: number
  x: number; y: number
}

const SEEDS: Seed[] = [
  { name: 'Chiado Atelier 4B', type: 'apartment', mode: 'long_term', status: 'occupied', district: 'Chiado', beds: 2, baths: 2, sqm: 96, price: 2450, x: 0.44, y: 0.52 },
  { name: 'Príncipe Real Townhouse', type: 'house', mode: 'long_term', status: 'occupied', district: 'Príncipe Real', beds: 4, baths: 3, sqm: 218, price: 4800, x: 0.40, y: 0.41 },
  { name: 'Alcântara Loft 12', type: 'apartment', mode: 'short_stay', status: 'occupied', district: 'Alcântara', beds: 1, baths: 1, sqm: 64, price: 185, x: 0.24, y: 0.66 },
  { name: 'Belém Riverside 07', type: 'apartment', mode: 'short_stay', status: 'available', district: 'Belém', beds: 2, baths: 2, sqm: 88, price: 240, x: 0.12, y: 0.71 },
  { name: 'Avenida Penthouse', type: 'apartment', mode: 'long_term', status: 'occupied', district: 'Avenida da Liberdade', beds: 3, baths: 3, sqm: 176, price: 6200, x: 0.48, y: 0.34 },
  { name: 'Estrela Garden Flat', type: 'apartment', mode: 'long_term', status: 'available', district: 'Estrela', beds: 2, baths: 1, sqm: 82, price: 1950, x: 0.34, y: 0.58 },
  { name: 'Parque das Nações Tower 21F', type: 'apartment', mode: 'long_term', status: 'reserved', district: 'Parque das Nações', beds: 3, baths: 2, sqm: 132, price: 3100, x: 0.88, y: 0.22 },
  { name: 'Cascais Ocean Villa', type: 'villa', mode: 'short_stay', status: 'occupied', district: 'Cascais', beds: 5, baths: 4, sqm: 340, price: 720, x: 0.06, y: 0.84 },
  { name: 'Sintra Hill House', type: 'villa', mode: 'short_stay', status: 'maintenance', district: 'Sintra', beds: 4, baths: 3, sqm: 265, price: 480, x: 0.02, y: 0.46 },
  { name: 'Baixa Commercial Suite 300', type: 'commercial', mode: 'long_term', status: 'occupied', district: 'Baixa', beds: 0, baths: 2, sqm: 410, price: 7400, x: 0.52, y: 0.48 },
  { name: 'Santos Design Studio', type: 'commercial', mode: 'long_term', status: 'available', district: 'Santos', beds: 0, baths: 1, sqm: 180, price: 3250, x: 0.30, y: 0.68 },
  { name: 'Graça Serviced Residence 2A', type: 'serviced', mode: 'short_stay', status: 'occupied', district: 'Graça', beds: 2, baths: 2, sqm: 104, price: 210, x: 0.62, y: 0.38 },
  { name: 'Graça Serviced Residence 2B', type: 'serviced', mode: 'short_stay', status: 'available', district: 'Graça', beds: 2, baths: 2, sqm: 104, price: 210, x: 0.63, y: 0.36 },
  { name: 'Alfama Stone Apartment', type: 'apartment', mode: 'short_stay', status: 'occupied', district: 'Alfama', beds: 1, baths: 1, sqm: 52, price: 165, x: 0.58, y: 0.50 },
  { name: 'Campo de Ourique 3D', type: 'apartment', mode: 'long_term', status: 'occupied', district: 'Campo de Ourique', beds: 3, baths: 2, sqm: 118, price: 2280, x: 0.28, y: 0.52 },
  { name: 'Lapa Consulate House', type: 'house', mode: 'long_term', status: 'occupied', district: 'Lapa', beds: 5, baths: 4, sqm: 302, price: 8900, x: 0.30, y: 0.62 },
  { name: 'Marvila Warehouse Unit 4', type: 'commercial', mode: 'long_term', status: 'reserved', district: 'Marvila', beds: 0, baths: 2, sqm: 620, price: 5600, x: 0.78, y: 0.30 },
  { name: 'Bairro Alto Duplex', type: 'apartment', mode: 'short_stay', status: 'occupied', district: 'Bairro Alto', beds: 2, baths: 1, sqm: 74, price: 195, x: 0.42, y: 0.46 },
  { name: 'Restelo Family Home', type: 'house', mode: 'long_term', status: 'available', district: 'Restelo', beds: 4, baths: 3, sqm: 240, price: 3950, x: 0.10, y: 0.62 },
  { name: 'Saldanha Corporate 9C', type: 'apartment', mode: 'long_term', status: 'occupied', district: 'Saldanha', beds: 2, baths: 2, sqm: 98, price: 2650, x: 0.56, y: 0.26 },
  { name: 'Anjos Micro-Loft 5', type: 'apartment', mode: 'short_stay', status: 'inactive', district: 'Anjos', beds: 1, baths: 1, sqm: 38, price: 120, x: 0.60, y: 0.30 },
  { name: 'Estoril Sea Terrace', type: 'apartment', mode: 'short_stay', status: 'reserved', district: 'Estoril', beds: 3, baths: 2, sqm: 142, price: 395, x: 0.04, y: 0.78 },
  { name: 'Areeiro Residence 11', type: 'apartment', mode: 'long_term', status: 'maintenance', district: 'Areeiro', beds: 2, baths: 1, sqm: 86, price: 1780, x: 0.70, y: 0.26 },
  { name: 'Comércio Retail Front', type: 'commercial', mode: 'long_term', status: 'occupied', district: 'Baixa', beds: 0, baths: 1, sqm: 155, price: 6100, x: 0.54, y: 0.54 },
]

const AMENITY_POOL = [
  'Air conditioning', 'Private terrace', 'Concierge', 'Secure parking', 'River view',
  'Fibre internet', 'Fitted kitchen', 'Dishwasher', 'In-unit laundry', 'Lift access',
  'Pet friendly', 'Furnished', 'Solar hot water', 'Roof garden', 'Gym access',
  'Smart locks', 'Fireplace', 'Storage unit', 'Wheelchair accessible', 'Pool',
]
const COMMERCIAL_AMENITIES = [
  'Loading bay', '3-phase power', 'Fibre internet', 'Secure parking', 'Alarm system',
  'Air conditioning', 'Meeting rooms', 'Street frontage', 'Goods lift', 'CCTV',
]

const DOC_NAMES: Array<[PropertyDocument['category'], string]> = [
  ['title', 'Title deed & registry extract.pdf'],
  ['insurance', 'Buildings insurance 2026.pdf'],
  ['compliance', 'Energy certificate (EPC).pdf'],
  ['inspection', 'Annual condition survey.pdf'],
  ['lease', 'Executed lease agreement.pdf'],
  ['compliance', 'Short-stay licence AL.pdf'],
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

const MAINT_NOTES = [
  'Boiler serviced — next due in 11 months.',
  'Balcony sealant reapplied after winter storms.',
  'Kitchen extractor replaced; receipt filed under documents.',
  'Intercom handset intermittent — monitor after tenant change.',
  'Repainted hallway and stairwell during last turnover.',
  'Water pressure regulator adjusted on the riser.',
  'Roof tiles inspected after high winds — no action needed.',
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
      line1: `${intBetween(2, 180)} Rua ${pick(['do Alecrim', 'da Rosa', 'Nova do Carvalho', 'de São Bento', 'das Janelas Verdes', 'do Século', 'Garrett', 'da Prata'])}`,
      district: s.district,
      city: 'Lisbon',
      country: 'Portugal',
      x: s.x,
      y: s.y,
    },
    bedrooms: s.beds,
    bathrooms: s.baths,
    sizeSqm: s.sqm,
    amenities,
    price: s.price,
    currency: 'EUR',
    managerId: s.mode === 'short_stay' ? 'tm-03' : commercial ? 'tm-04' : MANAGERS[i % MANAGERS.length],
    rating: Number(between(4.1, 5).toFixed(1)),
    availableFrom,
    acquiredOn: dayOffset(-intBetween(400, 2600)),
    yieldPct: Number(between(3.8, 9.4).toFixed(1)),
    notes: pick([
      'Long-standing corporate demand in this block — renewals rarely lapse.',
      'Highest review scores in the portfolio; protect the turnover window.',
      'Owner prefers 24 months minimum on any new lease.',
      'Consider a rent review at renewal — currently 8% under market.',
      'Short-stay licence renews annually; diary reminder set.',
      'Street-level unit: footfall data supports a premium at renewal.',
    ]),
    photoSeed: i * 37 + 11,
    documents: makeDocs(id, intBetween(3, 6)),
    occupancyHistory: history,
    maintenanceNotes: [...MAINT_NOTES].sort(() => rnd() - 0.5).slice(0, intBetween(2, 4)),
  }
})

/* ------------------------------ clients --------------------------- */
const CORPORATES = [
  'Lumina Capital Partners', 'Northmark Consulting', 'Cielo Studios',
  'Verdant Logistics BV', 'Atlas Semiconductor', 'Praxis Legal LLP',
]
const NATIONALITIES = ['Portuguese', 'British', 'German', 'Brazilian', 'Nigerian', 'French', 'Indian', 'Swedish', 'American', 'Dutch', 'Kenyan', 'Japanese']

const COMM_SUBJECTS: Array<[string, string]> = [
  ['Rent confirmation for this month', 'Transfer sent this morning, reference ends 4471. Could you confirm receipt?'],
  ['Request to renew lease', 'We would like to extend for a further 12 months on the same terms if possible.'],
  ['Heating not reaching the back bedroom', 'It runs warm in the living room but the far radiator stays cold.'],
  ['Early check-in possible?', 'Our flight lands 09:40 — any chance of dropping bags before the room is ready?'],
  ['Parking access card', 'The card stopped working at the barrier yesterday evening.'],
  ['Notice of departure', 'Giving formal notice as agreed — happy to allow viewings from next week.'],
  ['Deposit return timeline', 'Just checking when the deposit is scheduled to be released.'],
  ['Thank you — wonderful stay', 'The apartment was immaculate and Clara was incredibly helpful throughout.'],
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
      phone: `+351 9${intBetween(10, 29)} ${intBetween(100, 999)} ${intBetween(100, 999)}`,
      nationality: pick(NATIONALITIES),
      since: dayOffset(-intBetween(40, 1400)),
      status: i > 23 ? 'past' : i === 22 ? 'prospect' : 'active',
      propertyIds: [],
      idDocuments: makeDocs(id, intBetween(1, 3)).map((d) => ({
        ...d,
        category: 'id' as const,
        name: pick(['Passport scan.pdf', 'National ID card.jpg', 'Proof of address.pdf', 'Employment reference.pdf', 'Company registration.pdf']),
      })),
      notes: pick([
        'Prefers written communication; responds quickly by email.',
        'Excellent payment record across three tenancies.',
        'Relocation package handled by employer — invoices go to accounts payable.',
        'Requested quiet unit away from the street.',
        'Has a small dog; pet addendum signed and on file.',
        'Repeat guest — fourth stay with Altier.',
      ]),
      emergencyContact: `${pick(TENANT_NAMES)} · +351 9${intBetween(10, 29)} ${intBetween(100, 999)} ${intBetween(100, 999)}`,
      communications: comms,
      lifetimeValue: intBetween(3200, 96000),
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

  PROPERTIES.forEach((p, pi) => {
    const attach = (clientIdx: number) => {
      const c = activeClients[clientIdx % activeClients.length]
      if (!c.propertyIds.includes(p.id)) c.propertyIds.push(p.id)
      return c
    }

    if (p.mode === 'long_term') {
      // Current or most recent lease
      if (p.status === 'occupied' || p.status === 'maintenance') {
        const c = attach(pi)
        const start = dayOffset(-intBetween(60, 600))
        const months = pick([12, 12, 18, 24, 36])
        const end = iso(addDays(start, months * 30))
        out.push({
          id: `b-${++n}`, reference: `LSE-${2600 + n}`, propertyId: p.id, clientId: c.id,
          mode: 'long_term', status: new Date(end) < TODAY ? 'completed' : 'in_progress',
          start, end, rate: p.price, deposit: p.price * 2, guests: Math.max(1, p.bedrooms),
          source: pick(['direct', 'agency', 'corporate']), checkIn: '14:00', checkOut: '11:00',
          notes: 'Standard 60-day renewal notice window.', createdAt: dayOffset(-intBetween(610, 700)),
        })
      }
      if (p.status === 'reserved') {
        const c = attach(pi + 5)
        const start = dayOffset(intBetween(4, 30))
        out.push({
          id: `b-${++n}`, reference: `LSE-${2600 + n}`, propertyId: p.id, clientId: c.id,
          mode: 'long_term', status: 'upcoming', start, end: iso(addDays(start, 365)),
          rate: p.price, deposit: p.price * 2, guests: Math.max(1, p.bedrooms),
          source: 'agency', checkIn: '14:00', checkOut: '11:00',
          notes: 'Deposit received; keys released on move-in day.', createdAt: dayOffset(-intBetween(5, 25)),
        })
      }
    } else {
      // Short stays: a spread of past, live and forward bookings
      const count = p.status === 'inactive' ? 1 : intBetween(4, 8)
      let cursor = -intBetween(70, 110)
      for (let k = 0; k < count; k++) {
        const nights = intBetween(2, p.type === 'villa' ? 12 : 7)
        const start = cursor
        const end = start + nights
        cursor = end + intBetween(2, 14)
        const c = attach(pi + k * 3)
        const status: Booking['status'] =
          end < 0 ? 'completed' : start <= 0 && end >= 0 ? 'in_progress' : chance(0.12) ? 'pending' : 'upcoming'
        if (p.status === 'inactive' && status !== 'completed') continue
        out.push({
          id: `b-${++n}`, reference: `STY-${7100 + n}`, propertyId: p.id, clientId: c.id,
          mode: 'short_stay', status, start: dayOffset(start), end: dayOffset(end),
          rate: p.price, deposit: Math.round(p.price * 1.5), guests: intBetween(1, Math.max(2, p.bedrooms * 2)),
          source: pick(SOURCES), checkIn: '15:00', checkOut: '11:00',
          notes: pick(['Self check-in via smart lock.', 'Early check-in requested.', 'Cot requested for infant.', 'Airport transfer arranged.', 'Late checkout approved (13:00).']),
          createdAt: dayOffset(start - intBetween(8, 60)),
        })
      }
    }
  })
  // A cancelled booking makes the pipeline believable
  if (out.length) out[6] = { ...out[6], status: 'cancelled', notes: 'Guest cancelled — within free-cancellation window.' }
  return out
})()

/* ---------------------------- invoices ---------------------------- */
export const INVOICES: Invoice[] = (() => {
  const out: Invoice[] = []
  let n = 4200

  const push = (v: Omit<Invoice, 'id' | 'number'>) => {
    n++
    out.push({ ...v, id: `i-${n}`, number: `ALT-INV-${n}` })
  }

  BOOKINGS.forEach((b) => {
    const p = PROPERTIES.find((x) => x.id === b.propertyId)!
    if (b.status === 'cancelled') return

    if (b.mode === 'long_term') {
      // Twelve monthly rent charges around today
      for (let m = -11; m <= 3; m++) {
        const due = iso(addDays(new Date(TODAY.getFullYear(), TODAY.getMonth() + m, 1), 0))
        if (due < b.start || due > b.end) continue
        const overdueRoll = rnd()
        const isFuture = due > iso(TODAY)
        const status: Invoice['status'] = isFuture
          ? m === 0 ? 'pending' : 'upcoming'
          : overdueRoll < 0.09 ? 'overdue' : overdueRoll < 0.13 ? 'partial' : 'paid'
        const paidAmount = status === 'paid' ? p.price : status === 'partial' ? Math.round(p.price * 0.45) : 0
        push({
          propertyId: p.id, clientId: b.clientId, bookingId: b.id, type: 'rent',
          issuedOn: iso(addDays(due, -10)), dueOn: due, amount: p.price, paidAmount, status,
          method: paidAmount ? pick(['bank_transfer', 'bank_transfer', 'card', 'mobile_money']) : null,
          paidOn: status === 'paid' ? iso(addDays(due, -intBetween(0, 4))) : status === 'partial' ? iso(addDays(due, 2)) : null,
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
      const nights = Math.max(1, daysBetween(b.start, b.end))
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
    const amount = type === 'late_fee' ? intBetween(45, 160) : intBetween(80, 940)
    const status: Invoice['status'] = offset > 0 ? 'upcoming' : rnd() < 0.25 ? 'overdue' : 'paid'
    push({
      propertyId: p.id, clientId: c.id, bookingId: null, type,
      issuedOn: dayOffset(offset - 12), dueOn: due, amount,
      paidAmount: status === 'paid' ? amount : 0, status,
      method: status === 'paid' ? pick(['bank_transfer', 'card', 'cash']) : null,
      paidOn: status === 'paid' ? dayOffset(offset - 1) : null,
      memo: {
        utilities: 'Utilities recharge — water & common area electricity',
        service_fee: 'Management service fee',
        late_fee: 'Late payment fee per clause 8.2',
        maintenance_recharge: 'Tenant-liable repair recharge',
      }[type],
    })
  }

  return out.sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1))
})()

/* --------------------------- maintenance -------------------------- */
const MAINT_TEMPLATES: Array<{ title: string; cat: MaintenanceRequest['category']; desc: string; trade: string }> = [
  { title: 'Water ingress at bathroom ceiling', cat: 'plumbing', desc: 'Staining and active drip below the flat above. Needs a leak trace before making good.', trade: 'Plumbing' },
  { title: 'Boiler losing pressure overnight', cat: 'hvac', desc: 'Pressure drops from 1.4 to 0.6 bar within 12 hours. Suspect expansion vessel.', trade: 'Heating' },
  { title: 'Consumer unit tripping on kettle load', cat: 'electrical', desc: 'RCD trips intermittently on kitchen ring. Full circuit test required.', trade: 'Electrical' },
  { title: 'Dishwasher not draining', cat: 'appliance', desc: 'Standing water at end of cycle. Under warranty until next March.', trade: 'Appliance' },
  { title: 'Balcony railing loose at fixing', cat: 'safety', desc: 'Two anchor bolts have worked loose. Safety priority — restrict access until fixed.', trade: 'Metalwork' },
  { title: 'Deep clean before next check-in', cat: 'cleaning', desc: 'Standard turnover plus oven and grout treatment. Linen refresh included.', trade: 'Housekeeping' },
  { title: 'Damp patch on north gable wall', cat: 'structural', desc: 'Likely failed pointing. Scaffold quote requested from two contractors.', trade: 'Building' },
  { title: 'Garden overgrown before viewing', cat: 'grounds', desc: 'Hedge cut back, lawn cut, path cleared ahead of Thursday viewings.', trade: 'Grounds' },
  { title: 'Air-conditioning service overdue', cat: 'hvac', desc: 'Annual service and filter change across three split units.', trade: 'Heating' },
  { title: 'Entrance door closer failing', cat: 'safety', desc: 'Door slams; closer needs replacing to meet fire-door compliance.', trade: 'Building' },
  { title: 'Kitchen extractor motor noisy', cat: 'appliance', desc: 'Bearing noise at speed 3. Replacement unit sourced.', trade: 'Appliance' },
  { title: 'Lift annual inspection due', cat: 'safety', desc: 'Statutory LOLER inspection window opens in three weeks.', trade: 'Lift services' },
]
const VENDORS = ['Marques & Filhos', 'Tejo Building Services', 'Halcyon Facilities', 'Nordeste Electrical', 'Casa Clean Lisboa', 'Vertex Lift Care', 'Aguas Rapidas', 'Verde Grounds']

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
        : pick(['reported', 'scheduled', 'in_progress', 'awaiting_parts', 'completed'] as const)
    const estimated = intBetween(90, 3400)
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
        createdAt: dayOffset(-Math.max(0, reminders.rentDueLeadDays - gap)), read: chance(0.4),
        entity: { type: 'invoice', id: inv.id }, actionLabel: 'Send reminder',
      })
    } else if (inv.status === 'partial') {
      out.push({
        id: `n-inv-${inv.id}`, kind: 'payment_due', priority: 'normal',
        title: `Part payment received · ${formatMoney(inv.paidAmount)} of ${formatMoney(inv.amount)}`,
        body: `${clientOf(inv.clientId)} — balance of ${formatMoney(inv.amount - inv.paidAmount)} outstanding on ${inv.number}.`,
        createdAt: inv.dueOn, read: chance(0.5), entity: { type: 'invoice', id: inv.id }, actionLabel: 'Review balance',
      })
    }
  })

  bookings.forEach((b) => {
    const inDays = daysBetween(today, b.start)
    const outDays = daysBetween(today, b.end)
    if (b.status === 'upcoming' && inDays >= 0 && inDays <= 3) {
      out.push({
        id: `n-in-${b.id}`, kind: 'check_in', priority: inDays === 0 ? 'high' : 'normal',
        title: `Check-in ${inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`} · ${b.checkIn}`,
        body: `${clientOf(b.clientId)} arriving at ${nameOf(b.propertyId)} · ${b.guests} guest${b.guests > 1 ? 's' : ''} · ${b.reference}.`,
        createdAt: dayOffset(-1), read: chance(0.3), entity: { type: 'booking', id: b.id }, actionLabel: 'Prepare arrival',
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
    if (b.mode === 'long_term' && b.status === 'in_progress') {
      const expiry = daysBetween(today, b.end)
      if (expiry >= 0 && expiry <= reminders.leaseExpiryLeadDays) {
        out.push({
          id: `n-lease-${b.id}`, kind: 'lease_expiry', priority: expiry <= 21 ? 'high' : 'normal',
          title: `Lease expires in ${expiry} days`,
          body: `${clientOf(b.clientId)} at ${nameOf(b.propertyId)} — decide on renewal or start re-marketing.`,
          createdAt: dayOffset(-2), read: chance(0.35), entity: { type: 'booking', id: b.id }, actionLabel: 'Open renewal',
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
          title: `Vacant ${vacantFor} days · ${formatMoney(p.mode === 'long_term' ? p.price : p.price * 30)} monthly exposure`,
          body: `${p.name} in ${p.address.district} has had no booking since ${p.availableFrom}.`,
          createdAt: dayOffset(-1), read: chance(0.4), entity: { type: 'property', id: p.id }, actionLabel: 'Review listing',
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

  out.push({
    id: 'n-doc-1', kind: 'document', priority: 'normal',
    title: 'Short-stay licence renewal in 21 days',
    body: 'Alfama Stone Apartment — AL registration must be renewed before it lapses.',
    createdAt: dayOffset(-3), read: false, entity: { type: 'property', id: 'p-14' }, actionLabel: 'Upload renewal',
  })
  out.push({
    id: 'n-sys-1', kind: 'system', priority: 'low',
    title: 'Monthly owner statements are ready',
    body: 'Statements for 24 properties have been generated and are awaiting your review.',
    createdAt: dayOffset(-1), read: true, entity: null, actionLabel: 'Open reports',
  })

  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/* ------------------------------ helpers --------------------------- */
export function formatMoney(n: number, currency = 'EUR', compact = false) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: compact && Math.abs(n) >= 10000 ? 1 : 0,
    notation: compact && Math.abs(n) >= 10000 ? 'compact' : 'standard',
  }).format(n)
}
