import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bath, BedDouble, Building2, LayoutGrid, List, MapPin, Maximize2, Plus, Search, SlidersHorizontal, Star, X,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { PropertyImage } from '../components/PropertyImage'
import {
  Button, Card, Chip, EmptyState, PROPERTY_STATUS_META, SearchInput, SegmentedControl, Select,
  StatusChip, cx,
} from '../components/ui'
import { useStore } from '../lib/store'
import { can } from '../lib/rbac'
import { money } from '../lib/format'
import { itemVariants, listVariants } from '../lib/motion'
import type { Property, PropertyStatus, PropertyType, TenancyMode } from '../lib/types'

type View = 'grid' | 'list' | 'map'
type SortKey = 'name' | 'price-desc' | 'price-asc' | 'yield' | 'status'

const TYPE_LABEL: Record<PropertyType, string> = {
  apartment: 'Apartment', house: 'House', villa: 'Villa',
  serviced: 'Serviced', short_stay: 'Short stay', commercial: 'Commercial',
}

export default function Properties() {
  const { state, dispatch, toast } = useStore()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('grid')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [type, setType] = useState<'all' | PropertyType>('all')
  const [mode, setMode] = useState<'all' | TenancyMode>('all')
  const [district, setDistrict] = useState('all')
  const [manager, setManager] = useState('all')
  const [sort, setSort] = useState<SortKey>('name')

  const status = (params.get('status') ?? 'all') as 'all' | PropertyStatus
  const setStatus = (s: string) => {
    const next = new URLSearchParams(params)
    if (s === 'all') next.delete('status')
    else next.set('status', s)
    setParams(next, { replace: true })
  }

  const districts = useMemo(
    () => [...new Set(state.properties.map((p) => p.address.district))].sort(),
    [state.properties],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = state.properties.filter((p) => {
      if (status !== 'all' && p.status !== status) return false
      if (type !== 'all' && p.type !== type) return false
      if (mode !== 'all' && p.mode !== mode) return false
      if (district !== 'all' && p.address.district !== district) return false
      if (manager !== 'all' && p.managerId !== manager) return false
      if (!q) return true
      return `${p.name} ${p.code} ${p.address.district} ${p.address.line1} ${p.amenities.join(' ')}`.toLowerCase().includes(q)
    })
    const order: PropertyStatus[] = ['available', 'reserved', 'occupied', 'maintenance', 'inactive']
    return [...rows].sort((a, b) => {
      switch (sort) {
        case 'price-desc': return b.price - a.price
        case 'price-asc': return a.price - b.price
        case 'yield': return b.yieldPct - a.yieldPct
        case 'status': return order.indexOf(a.status) - order.indexOf(b.status)
        default: return a.name.localeCompare(b.name)
      }
    })
  }, [state.properties, status, type, mode, district, manager, query, sort])

  const counts = useMemo(() => {
    const by = (s: PropertyStatus) => state.properties.filter((p) => p.status === s).length
    return { all: state.properties.length, available: by('available'), occupied: by('occupied'), reserved: by('reserved'), maintenance: by('maintenance'), inactive: by('inactive') }
  }, [state.properties])

  const activeFilters = [type !== 'all', mode !== 'all', district !== 'all', manager !== 'all'].filter(Boolean).length

  const clearFilters = () => { setType('all'); setMode('all'); setDistrict('all'); setManager('all') }

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Properties"
        description="Every unit Altier manages — long lets, serviced residences, short stays and commercial space in one list."
        actions={
          <>
            <SegmentedControl<View>
              ariaLabel="Change property view"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={14} /><span className="hidden sm:inline">Grid</span></span> },
                { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List size={14} /><span className="hidden sm:inline">List</span></span> },
                { value: 'map', label: <span className="inline-flex items-center gap-1.5"><MapPin size={14} /><span className="hidden sm:inline">Map</span></span> },
              ]}
            />
            {can(state.role, 'edit:properties') && (
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => toast({ title: 'Add property', body: 'The intake form opens here in the full product.', tone: 'default' })}>
                <span className="hidden sm:inline">Add property</span>
              </Button>
            )}
          </>
        }
      />

      {/* ------------------------------- Controls ------------------------------ */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search by name, code, district or amenity…" className="min-w-[220px] flex-1" />
          <Button
            variant="secondary"
            icon={<SlidersHorizontal size={15} />}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={cx(activeFilters > 0 && 'border-gold text-gold')}
          >
            Filters
            {activeFilters > 0 && <span className="tnum ml-0.5 rounded-full bg-gold px-1.5 text-[10.5px] font-bold text-white">{activeFilters}</span>}
          </Button>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort properties" className="w-auto min-w-[164px]">
            <option value="name">Sort: name</option>
            <option value="price-desc">Sort: price, high to low</option>
            <option value="price-asc">Sort: price, low to high</option>
            <option value="yield">Sort: yield</option>
            <option value="status">Sort: status</option>
          </Select>
        </div>

        <div className="scroll-x -mx-1 px-1">
          <SegmentedControl
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            size="sm"
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'available', label: 'Available', count: counts.available },
              { value: 'occupied', label: 'Occupied', count: counts.occupied },
              { value: 'reserved', label: 'Reserved', count: counts.reserved },
              { value: 'maintenance', label: 'Maintenance', count: counts.maintenance },
              { value: 'inactive', label: 'Inactive', count: counts.inactive },
            ]}
          />
        </div>

        {filtersOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <Card className="p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-ink-secondary">Property type</span>
                  <Select value={type} onChange={(e) => setType(e.target.value as any)}>
                    <option value="all">Any type</option>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-ink-secondary">Letting model</span>
                  <Select value={mode} onChange={(e) => setMode(e.target.value as any)}>
                    <option value="all">Any model</option>
                    <option value="long_term">Long term</option>
                    <option value="short_stay">Short stay</option>
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-ink-secondary">District</span>
                  <Select value={district} onChange={(e) => setDistrict(e.target.value)}>
                    <option value="all">All districts</option>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-ink-secondary">Assigned manager</span>
                  <Select value={manager} onChange={(e) => setManager(e.target.value)}>
                    <option value="all">Anyone</option>
                    {state.team.filter((t) => t.role === 'manager').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </label>
              </div>
              {activeFilters > 0 && (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={clearFilters}>Clear filters</Button>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        <p className="text-[12.5px] text-ink-muted">
          Showing <span className="font-medium text-ink-secondary">{filtered.length}</span> of {state.properties.length} properties
        </p>
      </div>

      {/* -------------------------------- Results ------------------------------ */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search size={22} />}
            title="No properties match those filters"
            body="Try widening the status, clearing the district filter, or searching for a property code such as ALT-004."
            action={<Button variant="secondary" onClick={() => { clearFilters(); setQuery(''); setStatus('all') }}>Reset everything</Button>}
          />
        </Card>
      ) : view === 'map' ? (
        <MapView properties={filtered} />
      ) : view === 'list' ? (
        <ListView properties={filtered} team={state.team} />
      ) : (
        <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <motion.li key={p.id} variants={itemVariants}>
              <PropertyCard property={p} managerName={state.team.find((t) => t.id === p.managerId)?.name ?? '—'} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </>
  )
}

function PropertyCard({ property: p, managerName }: { property: Property; managerName: string }) {
  return (
    <Link
      to={`/properties/${p.id}`}
      className="group card block h-full overflow-hidden transition-[transform,box-shadow] duration-300 ease-premium hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative h-40 overflow-hidden">
        <div className="h-full transition-transform duration-500 ease-premium group-hover:scale-[1.04]">
          <PropertyImage seed={p.photoSeed} type={p.type} className="h-full" rounded="" />
        </div>
        <div className="absolute left-3 top-3"><StatusChip status={p.status} onImage /></div>
        <div className="absolute bottom-3 right-3">
          <Chip className="bg-navy-950/70 text-white backdrop-blur-sm">
            <Star size={11} className="fill-gold text-gold" /> {p.rating.toFixed(1)}
          </Chip>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-[16px] font-semibold text-ink">{p.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-ink-muted">
              <MapPin size={12} className="shrink-0" aria-hidden /> {p.address.district}, {p.address.city}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-surface-inset px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            {p.code}
          </span>
        </div>

        <ul className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-secondary">
          {p.bedrooms > 0 && <li className="inline-flex items-center gap-1.5"><BedDouble size={13} className="text-ink-muted" /> {p.bedrooms} bed</li>}
          <li className="inline-flex items-center gap-1.5"><Bath size={13} className="text-ink-muted" /> {p.bathrooms} bath</li>
          <li className="inline-flex items-center gap-1.5"><Maximize2 size={13} className="text-ink-muted" /> {p.sizeSqm} m²</li>
        </ul>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="tnum text-[17px] font-semibold leading-none text-ink">
              {money(p.price)}
              <span className="ml-1 text-[12px] font-normal text-ink-muted">{p.mode === 'short_stay' ? '/ night' : '/ month'}</span>
            </p>
            <p className="mt-1.5 text-[11.5px] text-ink-muted">Managed by {managerName.split(' ')[0]}</p>
          </div>
          <Chip className="bg-surface-inset text-ink-secondary">{TYPE_LABEL[p.type]}</Chip>
        </div>
      </div>
    </Link>
  )
}

function ListView({ properties, team }: { properties: Property[]; team: Array<{ id: string; name: string }> }) {
  return (
    <Card className="overflow-hidden">
      <div className="scroll-x">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead className="text-ink-muted">
            <tr className="border-b border-line bg-surface-inset/50">
              <th scope="col" className="px-5 py-3 font-medium sm:px-6">Property</th>
              <th scope="col" className="px-4 py-3 font-medium">District</th>
              <th scope="col" className="px-4 py-3 font-medium">Type</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Manager</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Yield</th>
              <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--c-border))]">
            {properties.map((p) => (
              <tr key={p.id} className="group transition-colors hover:bg-surface-inset/60">
                <td className="px-5 py-3 sm:px-6">
                  <Link to={`/properties/${p.id}`} className="flex items-center gap-3">
                    <PropertyImage seed={p.photoSeed} type={p.type} className="h-10 w-14 shrink-0" rounded="rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink group-hover:text-gold">{p.name}</span>
                      <span className="block text-[11.5px] text-ink-muted">{p.code} · {p.bedrooms > 0 ? `${p.bedrooms} bed · ` : ''}{p.sizeSqm} m²</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{p.address.district}</td>
                <td className="px-4 py-3 text-ink-secondary">{TYPE_LABEL[p.type]}</td>
                <td className="px-4 py-3"><StatusChip status={p.status} /></td>
                <td className="px-4 py-3 text-ink-secondary">{team.find((t) => t.id === p.managerId)?.name ?? '—'}</td>
                <td className="tnum px-4 py-3 text-right text-ink-secondary">{p.yieldPct}%</td>
                <td className="tnum px-5 py-3 text-right font-semibold text-ink sm:px-6">
                  {money(p.price)}<span className="ml-1 text-[11px] font-normal text-ink-muted">{p.mode === 'short_stay' ? '/n' : '/m'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function MapView({ properties }: { properties: Property[] }) {
  const [active, setActive] = useState<Property | null>(null)
  const navigate = useNavigate()
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="relative overflow-hidden lg:col-span-2">
        <div className="relative aspect-[4/3] w-full bg-surface-inset sm:aspect-[16/10]">
          {/* Schematic district plan — no tiles, no network, still spatially useful */}
          <svg viewBox="0 0 100 70" className="absolute inset-0 h-full w-full" aria-label="Schematic map of the portfolio">
            <defs>
              <pattern id="grid-map" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M5 0H0V5" fill="none" stroke="var(--viz-grid)" strokeWidth="0.25" />
              </pattern>
            </defs>
            <rect width="100" height="70" fill="url(#grid-map)" />
            <path d="M0 54 Q22 48 44 53 T100 50 L100 70 L0 70 Z" fill="var(--viz-1)" opacity="0.10" />
            <path d="M0 54 Q22 48 44 53 T100 50" fill="none" stroke="var(--viz-1)" strokeWidth="0.4" opacity="0.5" />
            <text x="4" y="66" fontSize="2.6" fill="var(--viz-axis)">Tagus estuary</text>
          </svg>

          {properties.map((p) => {
            const meta = PROPERTY_STATUS_META[p.status]
            return (
              <button
                key={p.id}
                onClick={() => setActive(p)}
                aria-label={`${p.name}, ${meta.label}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-200 hover:scale-125 focus-visible:scale-125"
                style={{ left: `${6 + p.address.x * 88}%`, top: `${10 + p.address.y * 74}%` }}
              >
                <span className={cx('block h-3 w-3 rounded-full ring-2 ring-[rgb(var(--c-surface-card))]', meta.dot)} />
                {active?.id === p.id && <span className={cx('absolute inset-0 animate-ping rounded-full opacity-60', meta.dot)} />}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line px-5 py-3">
          {(Object.keys(PROPERTY_STATUS_META) as Array<keyof typeof PROPERTY_STATUS_META>).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-secondary">
              <span className={cx('h-2 w-2 rounded-full', PROPERTY_STATUS_META[k].dot)} aria-hidden />
              {PROPERTY_STATUS_META[k].label}
            </span>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden">
        {active ? (
          <>
            <PropertyImage seed={active.photoSeed} type={active.type} className="h-36" rounded="" />
            <div className="flex-1 p-5">
              <StatusChip status={active.status} />
              <h3 className="mt-3 font-display text-lg font-semibold text-ink">{active.name}</h3>
              <p className="mt-1 text-[13px] text-ink-muted">{active.address.line1}, {active.address.district}</p>
              <p className="tnum mt-4 text-[18px] font-semibold text-ink">
                {money(active.price)}<span className="ml-1 text-[12px] font-normal text-ink-muted">{active.mode === 'short_stay' ? '/ night' : '/ month'}</span>
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {active.amenities.slice(0, 5).map((a) => (
                  <li key={a}><Chip className="bg-surface-inset text-ink-secondary">{a}</Chip></li>
                ))}
              </ul>
            </div>
            <div className="border-t border-line p-4">
              <Button block variant="primary" onClick={() => navigate(`/properties/${active.id}`)}>
                Open property
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<MapPin size={22} />}
            title="Select a property"
            body="Every pin is coloured by status. Choose one to see its details, rate and amenities without leaving the map."
          />
        )}
      </Card>
    </div>
  )
}
