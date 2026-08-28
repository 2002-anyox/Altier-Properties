import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, ShieldOff, UserRound } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader.js'
import {
  Avatar, Button, Card, CardHeader, Chip, EmptyState, Field, Input, Modal,
  SearchInput, SegmentedControl,
} from '../components/ui'
import { useStore } from '../lib/store.js'
import { can } from '../lib/rbac.js'
import { mediumDate } from '../lib/format.js'
import { itemVariants, listVariants } from '../lib/motion.js'
import { portal, type PortalLogin } from '../lib/api.js'
import type { Client } from '../lib/types.js'

/**
 * Tenants & guests — the people who rent from this portfolio, and which
 * of them can sign in to see their own records.
 *
 * Deliberately apart from Team & Access. A tenant is not a colleague: on
 * most plans their login costs nothing, and it opens one agreement, its
 * charges and its documents rather than any part of the portfolio. Mixing
 * the two lists is how somebody ends up with more access than intended.
 */
export default function Tenants() {
  const { state, toast } = useStore()
  const live = state.source === 'database'
  const mayManage = can(state.role, 'edit:clients')

  const [logins, setLogins] = useState<PortalLogin[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all')
  const [granting, setGranting] = useState<Client | null>(null)
  const [revoking, setRevoking] = useState<Client | null>(null)

  const refresh = useCallback(() => {
    if (!live) return
    portal.list().then((res) => setLogins(res.portal)).catch(() => setLogins([]))
  }, [live])
  useEffect(() => { refresh() }, [refresh])

  const hasLogin = useMemo(
    () => new Map(logins.map((l) => [l.clientId ?? '', l])),
    [logins],
  )

  const renters = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.clients
      .filter((c) => c.kind === 'tenant' || c.kind === 'guest')
      .filter((c) => {
        if (filter === 'with' && !hasLogin.has(c.id)) return false
        if (filter === 'without' && hasLogin.has(c.id)) return false
        if (!q) return true
        return `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [state.clients, query, filter, hasLogin])

  const withLogin = state.clients.filter((c) => hasLogin.has(c.id)).length

  const revoke = async (client: Client) => {
    try {
      const res = await portal.revoke(client.id)
      setLogins(res.portal)
      toast({
        title: 'Portal access closed',
        body: `${client.name} can no longer sign in. Their record is unchanged.`,
        tone: 'success',
      })
    } catch (error) {
      toast({ title: 'Not closed', body: (error as Error).message, tone: 'critical' })
    } finally {
      setRevoking(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Tenants & guests"
        description="The people who rent from this portfolio. Give one a login and they see their own agreement, charges and documents — nothing else here."
      />

      <Card className="card-pad mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, email or phone"
            className="min-w-[220px] flex-1"
          />
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            ariaLabel="Filter by portal access"
            options={[
              { value: 'all', label: 'All' },
              { value: 'with', label: 'With a login' },
              { value: 'without', label: 'No login' },
            ]}
          />
        </div>
        {live && (
          <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
            {withLogin === 0
              ? 'Nobody has portal access yet.'
              : `${withLogin} ${withLogin === 1 ? 'person has' : 'people have'} portal access.`}
            {' '}A tenant login does not take a paid seat unless this workspace is set up that way.
          </p>
        )}
      </Card>

      {renters.length === 0 ? (
        <Card className="card-pad">
          <EmptyState
            icon={<UserRound size={20} />}
            title="Nobody to show"
            body={query
              ? 'No tenant or guest matches that search.'
              : 'Tenants and guests appear here as soon as they are added on the Clients page.'}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Renters"
            subtitle={`${renters.length} ${renters.length === 1 ? 'person' : 'people'}`}
          />
          <motion.ul variants={listVariants} initial="hidden" animate="show" className="mt-3 divide-y divide-[rgb(var(--c-border))]">
            {renters.map((client) => {
              const login = hasLogin.get(client.id)
              return (
                <motion.li
                  key={client.id}
                  variants={itemVariants}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"
                >
                  <Avatar name={client.name} size={32} tone="soft" />
                  <span className="min-w-0 flex-1">
                    <Link
                      to={`/clients/${client.id}`}
                      className="link-underline block truncate text-[13.5px] font-medium text-ink"
                    >
                      {client.name}
                    </Link>
                    <span className="block truncate text-[11.5px] text-ink-muted">
                      {client.email || 'No email on file'}
                      {client.kind === 'guest' ? ' · guest' : ' · tenant'}
                    </span>
                  </span>

                  {login ? (
                    <Chip className="bg-status-good-soft text-status-good">
                      {login.hasPassword ? 'Can sign in' : 'Login not set up'}
                    </Chip>
                  ) : (
                    <Chip className="bg-surface-inset text-ink-muted">No login</Chip>
                  )}

                  <span className="hidden w-28 text-right text-[11.5px] text-ink-muted sm:block">
                    {login ? `since ${mediumDate(login.since)}` : `client since ${mediumDate(client.since)}`}
                  </span>

                  {live && mayManage && (
                    login ? (
                      <Button size="sm" variant="ghost" icon={<ShieldOff size={13} />} onClick={() => setRevoking(client)}>
                        Close
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="secondary" icon={<KeyRound size={13} />}
                        onClick={() => setGranting(client)}
                        disabled={!client.email}
                      >
                        Give access
                      </Button>
                    )
                  )}
                </motion.li>
              )
            })}
          </motion.ul>
        </Card>
      )}

      <GrantModal
        client={granting}
        onClose={() => setGranting(null)}
        onGranted={(next) => { setLogins(next); setGranting(null) }}
      />

      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Close portal access"
        subtitle={revoking ? `${revoking.name} will no longer be able to sign in.` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (revoking) void revoke(revoking) }}>
              Close access
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          Their client record, agreement and payment history stay exactly as they are.
          Only the login goes.
        </p>
      </Modal>
    </>
  )
}

/**
 * Opening a login for one renter.
 *
 * A password can be set now or left for later — an account without one
 * exists and cannot be signed into, which is the safe way round for
 * somebody you have not spoken to yet.
 */
function GrantModal({
  client, onClose, onGranted,
}: { client: Client | null; onClose: () => void; onGranted: (logins: PortalLogin[]) => void }) {
  const { toast } = useStore()
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setPassword(''); setProblem(null) }, [client])

  const grant = async () => {
    if (!client || busy) return
    if (password && password.length < 10) {
      setProblem('A password needs at least 10 characters.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const res = await portal.grant(client.id, password || undefined)
      onGranted(res.portal)
      toast({
        title: 'Portal access opened',
        body: password
          ? `${client.name} can sign in with ${client.email}. Tell them the password out of band.`
          : `${client.name} has an account at ${client.email}. Set a password when you speak to them.`,
        tone: 'success',
      })
    } catch (error) {
      setProblem((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!client}
      onClose={onClose}
      title="Give portal access"
      subtitle={client ? `${client.name} will see their own agreement, charges and documents.` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<KeyRound size={14} />} onClick={() => { void grant() }} disabled={busy}>
            {busy ? 'Opening…' : 'Open access'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="rounded-xl border border-line bg-surface-inset/50 p-3 text-[12.5px] leading-relaxed text-ink-muted">
          They sign in with <span className="text-ink-secondary">{client?.email}</span>.
          Nothing else in this workspace is reachable from that login — not the other
          tenants, not the portfolio, not the books.
        </p>

        <Field
          label="Password"
          id="pt-password"
          hint="Leave it blank and the account exists but cannot be signed into yet."
        >
          <Input
            id="pt-password" type="password" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 10 characters"
          />
        </Field>

        {problem && (
          <p role="alert" className="text-[12.5px] leading-relaxed text-[rgb(var(--c-status-critical))]">{problem}</p>
        )}
      </div>
    </Modal>
  )
}
