import { useEffect, useState } from 'react'
import { Copy, Send, Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '../ui'
import { useStore } from '../../lib/store.js'
import { workspace, needsUpgrade, type SeatUsage } from '../../lib/api.js'
import { STAFF_ROLE_OPTIONS, roleLabel } from '../../lib/rbac.js'
import type { Role } from '../../lib/types.js'

/**
 * Inviting somebody into this workspace.
 *
 * The seat check is the server's — this form asks, and shows what comes
 * back. Doing the arithmetic here as well would be a second answer that
 * can disagree with the first, and the first is the one that counts.
 *
 * There is no mail server behind Altier, so what comes back is a link to
 * pass on rather than a message that has been sent. Saying "invitation
 * emailed" would be a lie the recipient discovers by waiting.
 */
export function InviteModal({
  open, onClose, seats, onInvited,
}: {
  open: boolean
  onClose: () => void
  seats: SeatUsage | null
  onInvited: (result: { seats: SeatUsage; invitations: unknown[] }) => void
}) {
  const { state, toast } = useStore()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('manager')
  const [title, setTitle] = useState('')
  const [properties, setProperties] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmail(''); setRole('manager'); setTitle(''); setProperties([])
    setProblem(null); setUpgrade(false); setLink(null)
  }, [open])

  const addressLooksRight = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const full = !!seats && seats.remaining === 0
  const assignable = role === 'manager' || role === 'staff'

  const send = async () => {
    if (!addressLooksRight || busy) return
    setBusy(true)
    setProblem(null)
    try {
      const result = await workspace.invite({
        email: email.trim(),
        role,
        title: title.trim() || undefined,
        propertyIds: assignable ? properties : [],
      })
      setLink(result.link)
      onInvited(result)
      toast({
        title: 'Invitation ready',
        body: `Send ${email.trim()} the link to join as ${roleLabel(role).toLowerCase()}.`,
        tone: 'success',
      })
    } catch (error) {
      setProblem((error as Error).message)
      setUpgrade(needsUpgrade(error))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Link copied', body: 'Paste it wherever you talk to them.', tone: 'success' })
    } catch {
      /* Clipboard access is refused in some browsers and on insecure
         origins. The link is on screen and selectable, so this is a
         missing convenience rather than a failure worth alarming over. */
      toast({ title: 'Copy it by hand', body: 'This browser would not let Altier use the clipboard.', tone: 'default' })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={link ? 'Invitation ready' : full ? 'No seats left' : 'Invite somebody'}
      subtitle={link
        ? 'Nothing has been emailed — pass this link on yourself.'
        : full
          ? `${seats?.planLabel} covers ${seats?.limit} ${seats?.limit === 1 ? 'seat' : 'seats'}, and every one is spoken for.`
          : 'They choose their own password when they accept, and the seat is held until they do.'}
      footer={link || full
        ? <Button variant="primary" onClick={onClose}>{link ? 'Done' : 'Close'}</Button>
        : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary" icon={<Send size={14} />}
              onClick={() => { void send() }}
              disabled={!addressLooksRight || busy}
            >
              {busy ? 'Inviting…' : 'Send invitation'}
            </Button>
          </>
        )}
    >
      {full && !link ? (
        <div className="grid gap-4">
          <div className="rounded-2xl border border-gold/30 bg-gold-soft/60 p-4">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-gold-ink">
              <Sparkles size={15} /> Move up a plan to add somebody
            </span>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">
              {seats && upgradePitch(seats)}
            </p>
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            You can also make room here and now:
          </p>
          <ul className="grid gap-2 text-[12.5px] leading-relaxed text-ink-secondary">
            {seats?.pending ? (
              <li className="rounded-xl border border-line bg-surface-inset/50 px-3.5 py-2.5">
                Withdraw one of the {seats.pending} invitation{seats.pending === 1 ? '' : 's'} nobody
                has accepted. Each is holding a seat.
              </li>
            ) : null}
            <li className="rounded-xl border border-line bg-surface-inset/50 px-3.5 py-2.5">
              Remove somebody who has left. Their seat comes back immediately.
            </li>
            {!seats?.tenantsCountAsSeats && (
              <li className="rounded-xl border border-line bg-surface-inset/50 px-3.5 py-2.5">
                Tenant and guest logins are free on this plan, so a renter who needs
                access is not what is filling it up.
              </li>
            )}
          </ul>
        </div>
      ) : link ? (
        <div className="grid gap-4">
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            {email.trim()} joins as {roleLabel(role).toLowerCase()} once they follow this.
            It works once, and expires in seven days.
          </p>
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-inset/60 p-3">
            <code className="scroll-x flex-1 whitespace-nowrap text-[12px] text-ink-secondary">{link}</code>
            <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={() => { void copy() }}>
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {seats && (
            <p className="rounded-xl border border-line bg-surface-inset/50 p-3 text-[12px] leading-relaxed text-ink-muted">
              {seats.limit === null
                ? `${seats.planLabel}: no seat limit.`
                : `${seats.planLabel}: ${seats.used} of ${seats.limit} seats taken`
                  + `${seats.pending ? `, ${seats.pending} of them invitations nobody has accepted yet` : ''}.`}
            </p>
          )}

          <Field label="Their email" id="iv-email" hint="The invitation is addressed to it, and only it can accept.">
            <Input
              id="iv-email" type="email" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>

          <Field label="Role" id="iv-role" hint={STAFF_ROLE_OPTIONS.find((r) => r.id === role)?.blurb}>
            <Select id="iv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {STAFF_ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </Field>

          <Field label="Job title" id="iv-title" hint="Left blank, one is taken from the role.">
            <Input
              id="iv-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Short-Stay Manager"
            />
          </Field>

          {assignable && (
            <fieldset className="rounded-2xl border border-line p-4">
              <legend className="px-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                Properties they will work on
              </legend>
              <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
                {properties.length === 0
                  ? 'Nothing chosen yet. They can sign in and will see an empty portfolio until something is.'
                  : `${properties.length} of ${state.properties.length}.`}
              </p>
              <div className="scroll-y max-h-44 space-y-1 pr-1">
                {state.properties.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] transition-colors hover:bg-surface-inset/60"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[rgb(var(--c-gold))]"
                      checked={properties.includes(p.id)}
                      onChange={() => setProperties((ids) =>
                        ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id])}
                    />
                    <span className="text-ink">{p.name}</span>
                    <span className="ml-auto text-[11.5px] text-ink-muted">{p.code}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {problem && (
            <div
              role="alert"
              className={upgrade
                ? 'rounded-2xl border border-gold/30 bg-gold-soft/60 p-4'
                : 'text-[12.5px] leading-relaxed text-[rgb(var(--c-status-critical))]'}
            >
              {upgrade ? (
                <>
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-gold-ink">
                    <Sparkles size={15} /> This plan is full
                  </span>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">{problem}</p>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                    Withdraw an invitation nobody has accepted, remove somebody who has
                    left, or move up a plan. Billing lives on the Team &amp; Access page.
                  </p>
                </>
              ) : problem}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/** The offer, in the terms of the plan they are actually on. */
function upgradePitch(seats: SeatUsage) {
  if (seats.plan === 'starter') {
    return `Professional raises the limit from ${seats.limit ?? 3} to 10, and Enterprise removes it. `
      + 'Everything already in this workspace stays exactly as it is.'
  }
  if (seats.plan === 'professional') {
    return 'Enterprise removes the seat limit entirely. Everything already in this '
      + 'workspace stays exactly as it is.'
  }
  return 'This workspace has a seat count agreed with us. Get in touch and we will raise it.'
}
