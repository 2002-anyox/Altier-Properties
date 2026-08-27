import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Building, Mail, Phone, Plus, Search, Star, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader.js'
import {
  Avatar, Button, Card, Chip, EmptyState, SearchInput, SegmentedControl, Select, cx,
} from '../components/ui'
import { useStore } from '../lib/store.js'
import { can } from '../lib/rbac.js'
import { mediumDate, money } from '../lib/format.js'
import { itemVariants, listVariants } from '../lib/motion.js'
import { ClientFormModal } from '../components/forms/ClientFormModal.js'
import type { Client, ClientKind } from '../lib/types.js'

const KIND_LABEL: Record<ClientKind, string> = { tenant: 'Tenant', guest: 'Guest', corporate: 'Corporate', owner: 'Owner' }

export default function Clients() {
  const { state, toast } = useStore()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | ClientKind>('all')
  const [status, setStatus] = useState<'all' | Client['status']>('all')
  const [sort, setSort] = useState<'name' | 'value' | 'recent'>('name')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = state.clients.filter((c) => {
      if (kind !== 'all' && c.kind !== kind) return false
      if (status !== 'all' && c.status !== status) return false
      if (!q) return true
      return `${c.name} ${c.email} ${c.phone} ${c.nationality}`.toLowerCase().includes(q)
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'value') return b.lifetimeValue - a.lifetimeValue
      if (sort === 'recent') return a.since < b.since ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  }, [state.clients, query, kind, status, sort])

  const counts = {
    all: state.clients.length,
    tenant: state.clients.filter((c) => c.kind === 'tenant').length,
    guest: state.clients.filter((c) => c.kind === 'guest').length,
    corporate: state.clients.filter((c) => c.kind === 'corporate').length,
  }

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Clients"
        description="Tenants, short-stay guests and corporate accounts, with their agreements, documents, payment record and every conversation on file."
        actions={
          can(state.role, 'edit:clients') && (
            <Button variant="primary" icon={<UserPlus size={15} />} onClick={() => setAdding(true)}>
              <span className="hidden sm:inline">Add client</span>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search by name, email, phone or nationality…" className="min-w-[220px] flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as any)} aria-label="Filter by client status" className="w-auto min-w-[150px]">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="prospect">Prospect</option>
            <option value="past">Past</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort clients" className="w-auto min-w-[164px]">
            <option value="name">Sort: name</option>
            <option value="value">Sort: lifetime value</option>
            <option value="recent">Sort: newest first</option>
          </Select>
        </div>

        <div className="scroll-x -mx-1 px-1">
          <SegmentedControl
            ariaLabel="Filter by client type"
            value={kind}
            onChange={setKind}
            size="sm"
            options={[
              { value: 'all', label: 'Everyone', count: counts.all },
              { value: 'tenant', label: 'Tenants', count: counts.tenant },
              { value: 'guest', label: 'Guests', count: counts.guest },
              { value: 'corporate', label: 'Corporate', count: counts.corporate },
            ]}
          />
        </div>

        <p className="text-[12.5px] text-ink-muted">
          Showing <span className="font-medium text-ink-secondary">{rows.length}</span> of {state.clients.length} clients
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          {state.clients.length === 0 ? (
            <EmptyState
              icon={<Users size={22} />}
              title="No clients yet"
              body="Tenants, guests and corporate accounts live here. Add somebody, then place them in a unit with an agreement."
              action={can(state.role, 'edit:clients')
                ? <Button variant="primary" icon={<UserPlus size={15} />} onClick={() => setAdding(true)}>Add the first client</Button>
                : undefined}
            />
          ) : (
            <EmptyState
              icon={<Search size={22} />}
              title="No clients match"
              body="Try a different spelling, clear the type filter, or search by email domain."
              action={<Button variant="secondary" onClick={() => { setQuery(''); setKind('all'); setStatus('all') }}>Reset filters</Button>}
            />
          )}
        </Card>
      ) : (
        <motion.ul variants={listVariants} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const props = c.propertyIds.map((id) => state.properties.find((p) => p.id === id)).filter(Boolean)
            return (
              <motion.li key={c.id} variants={itemVariants}>
                <Link
                  to={`/clients/${c.id}`}
                  className="card block h-full p-5 transition-[transform,box-shadow] duration-300 ease-premium hover:-translate-y-1 hover:shadow-lift"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={c.name} size={44} tone={c.kind === 'corporate' ? 'soft' : 'navy'} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15px] font-semibold text-ink">{c.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
                        {c.kind === 'corporate' ? <Building size={11} /> : <Users size={11} />}
                        {KIND_LABEL[c.kind]} · client since {mediumDate(c.since)}
                      </p>
                    </div>
                    <Chip
                      className={cx(
                        c.status === 'active' ? 'bg-[rgb(var(--c-status-good)/0.12)] text-[rgb(var(--c-status-good))]'
                          : c.status === 'prospect' ? 'bg-gold-soft text-gold-ink' : 'bg-surface-inset text-ink-muted',
                      )}
                    >
                      {c.status}
                    </Chip>
                  </div>

                  <ul className="mt-4 space-y-1.5 text-[12.5px] text-ink-secondary">
                    <li className="flex min-w-0 items-center gap-2">
                      <Mail size={12} className="shrink-0 text-ink-muted" aria-hidden />
                      <span className="truncate">{c.email}</span>
                    </li>
                    <li className="flex min-w-0 items-center gap-2">
                      <Phone size={12} className="shrink-0 text-ink-muted" aria-hidden />
                      <span className="truncate">{c.phone}</span>
                    </li>
                  </ul>

                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Properties</p>
                      <p className="mt-1 truncate text-[12.5px] text-ink-secondary">
                        {props.length ? props.map((p) => p!.name).join(', ') : 'None assigned'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum text-[15px] font-semibold text-ink">{money(c.lifetimeValue, true)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-ink-muted">
                        <Star size={10} className="fill-gold text-gold" /> {c.rating.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.li>
            )
          })}
        </motion.ul>
      )}

      <ClientFormModal open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
