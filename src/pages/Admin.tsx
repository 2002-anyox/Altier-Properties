import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Building2, LifeBuoy, ShieldAlert } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader.js'
import { Button, Card, CardHeader, Chip, EmptyState } from '../components/ui'
import { useStore } from '../lib/store.js'
import { mediumDate } from '../lib/format.js'
import { itemVariants, listVariants } from '../lib/motion.js'
import { admin, type AdminOrganization } from '../lib/api.js'

const PLAN_CHIP: Record<string, string> = {
  starter: 'bg-surface-inset text-ink-secondary',
  professional: 'bg-gold-soft text-gold-ink',
  enterprise: 'bg-status-info-soft text-status-info',
}

/**
 * Altier's own support desk.
 *
 * Reached only by a profile flagged as a super admin, which is set by
 * hand in the database and by nothing a customer can press. Deliberately
 * thin and read-only: it answers "how big is this account" so support can
 * help, and it does not open anybody's records. Wanting to see a
 * customer's books is a reason to ask them, not a feature.
 */
export default function Admin() {
  const { state } = useStore()
  const [rows, setRows] = useState<AdminOrganization[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    admin.organizations()
      .then((res) => setRows(res.organizations))
      .catch((error: Error) => setProblem(error.message))
  }, [])

  if (!state.member?.isSuperAdmin) {
    return (
      <div className="card mx-auto max-w-xl">
        <EmptyState
          icon={<ShieldAlert size={22} />}
          title="Not available"
          body="This area is for Altier's own support staff."
          action={<Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>}
        />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Altier internal"
        title="Support"
        description="Every workspace on this deployment, and how much of its plan it is using. Enough to answer a support question, and no further into anybody's records."
      />

      {problem && (
        <Card className="card-pad mb-5" role="alert">
          <p className="text-[13px] leading-relaxed text-[rgb(var(--c-status-critical))]">{problem}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Workspaces"
          subtitle={rows ? `${rows.length} on this deployment` : 'Loading…'}
        />
        {rows && rows.length === 0 ? (
          <div className="px-5 pb-6 pt-2 sm:px-6">
            <EmptyState
              icon={<LifeBuoy size={20} />}
              title="Nobody has signed up yet"
              body="The first workspace appears here as soon as somebody creates an owner account."
            />
          </div>
        ) : (
          <motion.ul variants={listVariants} initial="hidden" animate="show" className="mt-3 divide-y divide-[rgb(var(--c-border))]">
            {(rows ?? []).map((org) => (
              <motion.li
                key={org.id}
                variants={itemVariants}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-inset text-ink-muted" aria-hidden>
                  <Building2 size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{org.name}</span>
                  <span className="block text-[11.5px] text-ink-muted">
                    {org.slug} · since {mediumDate(String(org.createdAt).slice(0, 10))}
                  </span>
                </span>
                <Chip className={PLAN_CHIP[org.plan ?? 'starter'] ?? PLAN_CHIP.starter!}>
                  {org.plan ?? 'no plan'}{org.status ? ` · ${org.status.replace('_', ' ')}` : ''}
                </Chip>
                <span className="tnum hidden w-44 text-right text-[12px] text-ink-secondary sm:block">
                  {org.members}{org.seatLimit === null ? '' : ` / ${org.seatLimit}`} seats
                  {' · '}{org.properties} {org.properties === 1 ? 'property' : 'properties'}
                  {org.tenants ? ` · ${org.tenants} portal` : ''}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Card>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
        These figures come from counts, not from reading anybody&rsquo;s records. The row-level
        policies still apply to every other page in this app, including for this account.
      </p>
    </>
  )
}
