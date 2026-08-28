import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck, Clock, Mail, Pencil, ShieldCheck, Sparkles, Trash2, UserPlus, X,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader.js'
import {
  Avatar, Button, Card, CardHeader, Chip, EmptyState, Meter, cx,
} from '../components/ui'
import { MemberFormModal } from '../components/forms/MemberFormModal.js'
import { InviteModal } from '../components/forms/InviteModal.js'
import { ConfirmDelete } from '../components/forms/ConfirmDelete.js'
import { useStore } from '../lib/store.js'
import { can, roleLabel } from '../lib/rbac.js'
import { mediumDate } from '../lib/format.js'
import { itemVariants, listVariants } from '../lib/motion.js'
import { workspace, type OpenInvitation, type SeatUsage } from '../lib/api.js'
import type { TeamMember } from '../lib/types.js'

const STATUS_COPY: Record<SeatUsage['status'], { label: string; chip: string }> = {
  trialing: { label: 'On trial', chip: 'bg-status-info-soft text-status-info' },
  active: { label: 'Active', chip: 'bg-status-good-soft text-status-good' },
  past_due: { label: 'Payment overdue', chip: 'bg-status-critical-soft text-status-critical' },
  cancelled: { label: 'Cancelled', chip: 'bg-status-critical-soft text-status-critical' },
}

/**
 * Team & Access — who works in this workspace, what the plan allows, and
 * who has been asked and not yet answered.
 *
 * The figures are the server's, fetched here rather than derived from the
 * portfolio the app already holds. Counting seats in the browser would
 * produce a second answer that can disagree with the one that decides
 * whether an invitation goes out.
 */
export default function Team() {
  const { state, dispatch, toast } = useStore()
  const live = state.source === 'database'
  const mayManage = can(state.role, 'manage:team')

  const [seats, setSeats] = useState<SeatUsage | null>(null)
  const [invitations, setInvitations] = useState<OpenInvitation[]>([])
  const [organisation, setOrganisation] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editing, setEditing] = useState<TeamMember | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const refresh = useCallback(() => {
    if (!live || !mayManage) return
    workspace.read()
      .then((view) => {
        setSeats(view.seats)
        setInvitations(view.invitations)
        setOrganisation(view.organization?.name ?? null)
        setLoadError(null)
      })
      .catch((error: Error) => setLoadError(error.message))
  }, [live, mayManage])

  useEffect(() => { refresh() }, [refresh])

  const withdraw = async (invitation: OpenInvitation) => {
    try {
      const result = await workspace.revoke(invitation.id)
      setSeats(result.seats)
      setInvitations(result.invitations)
      toast({
        title: 'Invitation withdrawn',
        body: `${invitation.email} can no longer use that link, and the seat is free.`,
        tone: 'success',
      })
    } catch (error) {
      toast({ title: 'Not withdrawn', body: (error as Error).message, tone: 'critical' })
    }
  }

  const staff = state.team
  const full = !!seats && seats.remaining === 0

  /* Naming what stands in the way beats a refusal after the fact. */
  const blockers = removing
    ? [
        state.properties.filter((p) => p.managerId === removing.id).length
          && `${state.properties.filter((p) => p.managerId === removing.id).length} properties to reassign`,
        state.maintenance.filter((m) => m.assigneeId === removing.id).length
          && `${state.maintenance.filter((m) => m.assigneeId === removing.id).length} maintenance jobs to reassign`,
      ].filter(Boolean) as string[]
    : []

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Team & access"
        description={organisation
          ? `Everyone who works in ${organisation}, what their role reaches, and how much of the plan is spoken for.`
          : 'Everyone who works in this portfolio, what their role reaches, and how much of the plan is spoken for.'}
        actions={mayManage && (
          <span className="flex gap-2">
            <Button variant="secondary" icon={<UserPlus size={15} />} onClick={() => { setEditing(undefined); setFormOpen(true) }}>
              <span className="hidden sm:inline">Add directly</span>
            </Button>
            {live && (
              <Button variant="primary" icon={<Mail size={15} />} onClick={() => setInviteOpen(true)}>
                <span className="hidden sm:inline">Invite</span>
              </Button>
            )}
          </span>
        )}
      />

      {loadError && (
        <Card className="card-pad mb-5" role="alert">
          <p className="text-[13px] leading-relaxed text-[rgb(var(--c-status-critical))]">{loadError}</p>
        </Card>
      )}

      {seats && <PlanCard seats={seats} />}

      <Card className="mt-5 overflow-hidden">
        <CardHeader
          title="People"
          subtitle={`${staff.length} ${staff.length === 1 ? 'person' : 'people'} with access to this workspace`}
        />
        <div className="scroll-x mt-3">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="text-ink-muted">
              <tr className="border-y border-line bg-surface-inset/50">
                <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Reaches</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Contact</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Since</th>
                {mayManage && <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--c-border))]">
              {staff.map((member) => (
                <tr key={member.id} className="transition-colors hover:bg-surface-inset/60">
                  <td className="px-5 py-3 sm:px-6">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={member.name} size={30} tone="soft" />
                      <span>
                        <span className="block font-medium text-ink">{member.name}</span>
                        <span className="block text-[11.5px] text-ink-muted">{member.title}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Chip className="bg-gold-soft text-gold-ink">{roleLabel(member.role)}</Chip>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    <Reach member={member} total={state.properties.length} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="block text-ink-secondary">{member.email}</span>
                    <span className="block text-[11.5px] text-ink-muted">{member.phone}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{mediumDate(member.since)}</td>
                  {mayManage && (
                    <td className="px-5 py-3 text-right sm:px-6">
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(member); setFormOpen(true) }}>
                          <Pencil size={14} /><span className="sr-only">Edit {member.name}</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRemoving(member)}>
                          <Trash2 size={14} /><span className="sr-only">Remove {member.name}</span>
                        </Button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {live && mayManage && (
        <Card className="mt-5 overflow-hidden">
          <CardHeader
            title="Invited"
            subtitle={invitations.length
              ? `${invitations.length} ${invitations.length === 1 ? 'person has' : 'people have'} been asked and not yet joined. Each holds a seat.`
              : 'Nobody is waiting to accept.'}
          />
          {invitations.length === 0 ? (
            <div className="px-5 pb-6 pt-2 sm:px-6">
              <EmptyState
                icon={<Mail size={20} />}
                title="No open invitations"
                body="Invite somebody and the link appears here until they use it or you withdraw it."
              />
            </div>
          ) : (
            <motion.ul variants={listVariants} initial="hidden" animate="show" className="mt-3 divide-y divide-[rgb(var(--c-border))]">
              {invitations.map((invitation) => (
                <motion.li
                  key={invitation.id}
                  variants={itemVariants}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-inset text-ink-muted" aria-hidden>
                    <Clock size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{invitation.email}</span>
                    <span className="block text-[11.5px] text-ink-muted">
                      {roleLabel(invitation.role)}
                      {invitation.title ? ` · ${invitation.title}` : ''}
                      {' · expires '}{mediumDate(String(invitation.expiresAt).slice(0, 10))}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { void withdraw(invitation) }}>
                    Withdraw
                  </Button>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Card>
      )}

      {full && mayManage && (
        <Card className="card-pad mt-5 border-gold/30 bg-gold-soft/40">
          <span className="flex items-center gap-2 text-[13.5px] font-semibold text-gold-ink">
            <Sparkles size={16} /> Every seat is taken
          </span>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
            {seats?.planLabel} covers {seats?.limit} {seats?.limit === 1 ? 'seat' : 'seats'}.
            To add somebody, withdraw an invitation nobody has accepted, remove a person
            who has left, or move up a plan.
          </p>
        </Card>
      )}

      <MemberFormModal open={formOpen} onClose={() => { setFormOpen(false); refresh() }} member={editing} />
      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        seats={seats}
        onInvited={(result) => {
          setSeats(result.seats)
          setInvitations(result.invitations as OpenInvitation[])
        }}
      />
      <ConfirmDelete
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove from this workspace"
        subject={blockers.length
          ? `${removing?.name} still has work assigned to them, so they cannot be removed yet.`
          : `${removing?.name} loses access here immediately and the seat comes back. Their `
            + 'Altier account is untouched — it may be their seat in somebody else\'s workspace.'}
        consequences={blockers}
        confirmLabel={blockers.length ? 'Try anyway' : 'Remove'}
        onConfirm={() => {
          if (!removing) return
          dispatch({ type: 'delete-member', id: removing.id })
          setRemoving(null)
          window.setTimeout(refresh, 500)
        }}
      />
    </>
  )
}

/** What one person's role and assignments actually let them open. */
function Reach({ member, total }: { member: TeamMember; total: number }) {
  if (member.role === 'owner' || member.role === 'accountant') {
    return <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-gold" /> The whole portfolio</span>
  }
  const n = member.propertyIds?.length ?? 0
  if (n === 0) {
    return <span className="text-[rgb(var(--c-status-critical))]">Nothing assigned yet</span>
  }
  return <span className="tnum">{n} of {total} properties</span>
}

/** The subscription, said in the terms an owner would use. */
function PlanCard({ seats }: { seats: SeatUsage }) {
  const status = STATUS_COPY[seats.status]
  const unlimited = seats.limit === null
  const tight = !unlimited && seats.remaining !== null && seats.remaining <= 1

  return (
    <Card className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gold">Subscription</p>
          <h2 className="mt-1.5 flex items-center gap-2.5 font-display text-[21px] font-semibold text-ink">
            {seats.planLabel}
            <Chip className={status.chip}>{status.label}</Chip>
          </h2>
        </div>
        <div className="text-right">
          <p className="tnum font-display text-[26px] font-semibold leading-none text-ink">
            {seats.used}
            <span className="text-ink-muted">{unlimited ? '' : ` / ${seats.limit}`}</span>
          </p>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {unlimited
              ? 'seats in use, no limit'
              : `seats in use · ${seats.remaining} left`}
          </p>
        </div>
      </div>

      {!unlimited && (
        <Meter
          className="mt-4"
          value={seats.used}
          max={seats.limit ?? 1}
          tone={tight ? 'critical' : 'gold'}
          label={`${seats.used} of ${seats.limit} seats in use`}
        />
      )}

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <Figure
          label="Working here"
          value={String(seats.used - seats.pending)}
          note="people who have accepted"
        />
        <Figure
          label="Invited"
          value={String(seats.pending)}
          note={seats.pending ? 'holding a seat until they accept' : 'nobody waiting'}
        />
        <Figure
          label="Tenant logins"
          value={String(seats.tenants)}
          note={seats.tenantsCountAsSeats ? 'counted against the plan' : 'free on this plan'}
        />
      </dl>

      {seats.status === 'past_due' && (
        <p className="mt-5 rounded-xl border border-[rgb(var(--c-status-critical)/0.3)] bg-[rgb(var(--c-status-critical)/0.08)] px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-secondary">
          There is an unpaid invoice on this workspace. Everything here keeps working,
          but nobody new can be added until it is settled.
        </p>
      )}
    </Card>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface-inset/40 px-4 py-3.5')}>
      <dt className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
      <dd className="tnum mt-1 font-display text-[19px] font-semibold text-ink">{value}</dd>
      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">{note}</p>
    </div>
  )
}
