import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Building2, CalendarRange, CreditCard, CornerDownLeft, LayoutDashboard,
  Search, Users, Wrench,
} from 'lucide-react'
import { useStore } from '../../lib/store'
import { can } from '../../lib/rbac'
import { cx, useEscape, useLockBody } from '../ui'
import { popVariants, swift } from '../../lib/motion'
import { money } from '../../lib/format'

interface Cmd {
  id: string
  label: string
  hint: string
  group: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette() {
  const { state, paletteOpen, setPaletteOpen, toggleTheme } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useLockBody(paletteOpen)
  useEscape(paletteOpen, () => setPaletteOpen(false))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!paletteOpen)
      }
      if (e.key === '/' && !paletteOpen && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, setPaletteOpen])

  useEffect(() => {
    if (paletteOpen) {
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [paletteOpen])

  const go = (to: string) => () => { navigate(to); setPaletteOpen(false) }

  const commands = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = [
      { id: 'go-dash', label: 'Dashboard', hint: 'Portfolio overview', group: 'Go to', icon: <LayoutDashboard size={15} />, run: go('/') },
      { id: 'go-avail', label: 'Availability calendar', hint: 'Free, occupied and reserved', group: 'Go to', icon: <CalendarRange size={15} />, run: go('/availability') },
      { id: 'go-props', label: 'Properties', hint: 'All units and listings', group: 'Go to', icon: <Building2 size={15} />, run: go('/properties') },
      { id: 'go-clients', label: 'Clients', hint: 'Tenants and guests', group: 'Go to', icon: <Users size={15} />, run: go('/clients') },
      { id: 'go-pay', label: 'Payments', hint: 'Invoices and due dates', group: 'Go to', icon: <CreditCard size={15} />, run: go('/payments') },
      { id: 'go-mnt', label: 'Maintenance', hint: 'Open jobs and vendors', group: 'Go to', icon: <Wrench size={15} />, run: go('/maintenance') },
    ]
    const actions: Cmd[] = [
      { id: 'act-theme', label: 'Toggle light / dark theme', hint: 'Appearance', group: 'Actions', icon: <ArrowRight size={15} />, run: () => { toggleTheme(); setPaletteOpen(false) } },
      { id: 'act-overdue', label: 'Show overdue payments', hint: `${state.invoices.filter((i) => i.status === 'overdue').length} outstanding`, group: 'Actions', icon: <CreditCard size={15} />, run: go('/payments?status=overdue') },
      { id: 'act-vacant', label: 'Show vacant properties', hint: `${state.properties.filter((p) => p.status === 'available').length} available now`, group: 'Actions', icon: <Building2 size={15} />, run: go('/properties?status=available') },
    ]
    const props: Cmd[] = state.properties.map((p) => ({
      id: `p-${p.id}`,
      label: p.name,
      hint: `${p.address.district} · ${p.code}`,
      group: 'Properties',
      icon: <Building2 size={15} />,
      run: go(`/properties/${p.id}`),
    }))
    const clients: Cmd[] = state.clients.map((c) => ({
      id: `c-${c.id}`,
      label: c.name,
      hint: `${c.kind === 'corporate' ? 'Corporate' : c.kind === 'guest' ? 'Guest' : 'Tenant'} · ${c.email}`,
      group: 'Clients',
      icon: <Users size={15} />,
      run: go(`/clients/${c.id}`),
    }))
    const invoices: Cmd[] = state.invoices.slice(0, 40).map((i) => ({
      id: `i-${i.id}`,
      label: i.number,
      hint: `${money(i.amount)} · ${i.memo}`,
      group: 'Invoices',
      icon: <CreditCard size={15} />,
      run: go(`/payments?invoice=${i.id}`),
    }))
    const all = [...nav, ...actions, ...props, ...clients, ...invoices]
    return all.filter((c) => {
      if (c.group === 'Clients') return can(state.role, 'view:clients')
      if (c.group === 'Invoices') return can(state.role, 'view:payments')
      return true
    })
  }, [state, navigate, toggleTheme, setPaletteOpen])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? commands.filter((c) => `${c.label} ${c.hint} ${c.group}`.toLowerCase().includes(q)).slice(0, 24)
      : commands.filter((c) => c.group === 'Go to' || c.group === 'Actions')
    const groups = new Map<string, Cmd[]>()
    matched.forEach((c) => {
      const arr = groups.get(c.group) ?? []
      arr.push(c)
      groups.set(c.group, arr)
    })
    return { flat: matched, groups: [...groups.entries()] }
  }, [query, commands])

  useEffect(() => { setCursor(0) }, [query])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(results.flat.length - 1, c + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
    if (e.key === 'Enter') { e.preventDefault(); results.flat[cursor]?.run() }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  let flatIndex = -1

  return (
    <AnimatePresence>
      {paletteOpen && (
        <div className="fixed inset-0 z-[85] flex items-start justify-center p-4 pt-[10vh] sm:pt-[14vh]">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={swift}
            onClick={() => setPaletteOpen(false)} className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px]"
          />
          <motion.div
            variants={popVariants} initial="initial" animate="animate" exit="exit"
            role="dialog" aria-modal="true" aria-label="Command palette"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={17} className="shrink-0 text-ink-muted" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search or jump to…"
                aria-label="Search or jump to"
                className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
              />
              <kbd className="hidden rounded-md border border-line bg-surface-inset px-1.5 py-0.5 text-[10.5px] text-ink-muted sm:block">Esc</kbd>
            </div>

            <ul ref={listRef} className="max-h-[min(420px,52vh)] overflow-y-auto p-2">
              {results.flat.length === 0 && (
                <li className="px-3 py-10 text-center text-[13.5px] text-ink-muted">
                  Nothing matches “{query}”. Try a property name, client or invoice number.
                </li>
              )}
              {results.groups.map(([group, items]) => (
                <li key={group} className="mb-1">
                  <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-muted">{group}</p>
                  <ul>
                    {items.map((c) => {
                      flatIndex += 1
                      const active = flatIndex === cursor
                      const idx = flatIndex
                      return (
                        <li key={c.id}>
                          <button
                            data-active={active}
                            onMouseEnter={() => setCursor(idx)}
                            onClick={c.run}
                            className={cx(
                              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                              active ? 'bg-surface-inset' : 'hover:bg-surface-inset/60',
                            )}
                          >
                            <span className={cx('shrink-0', active ? 'text-gold' : 'text-ink-muted')}>{c.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium text-ink">{c.label}</span>
                              <span className="block truncate text-[11.5px] text-ink-muted">{c.hint}</span>
                            </span>
                            {active && <CornerDownLeft size={13} className="shrink-0 text-ink-muted" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-4 border-t border-line bg-surface-inset/60 px-4 py-2.5 text-[11px] text-ink-muted">
              <span><kbd className="rounded border border-line px-1">↑</kbd> <kbd className="rounded border border-line px-1">↓</kbd> navigate</span>
              <span><kbd className="rounded border border-line px-1">↵</kbd> open</span>
              <span className="ml-auto hidden sm:block">Press <kbd className="rounded border border-line px-1">/</kbd> anywhere</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
