import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '../ui'
import { useStore } from '../../lib/store.js'
import { api } from '../../lib/api.js'
import {
  editMember, emptyMemberDraft, memberDraftFrom, newMember, type MemberDraft,
} from '../../lib/create.js'
import { STAFF_ROLE_OPTIONS, roleLabel } from '../../lib/rbac.js'
import type { Role, TeamMember } from '../../lib/types.js'

export function MemberFormModal({
  open, onClose, member,
}: { open: boolean; onClose: () => void; member?: TeamMember }) {
  const { state, dispatch, toast } = useStore()
  const editing = !!member
  const live = state.source === 'database'
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [draft, setDraft] = useState<MemberDraft>(() =>
    member ? memberDraftFrom(member) : emptyMemberDraft())

  useEffect(() => {
    if (!open) return
    setDraft(member ? memberDraftFrom(member) : emptyMemberDraft())
    setPassword('')
    setPasswordError(null)
  }, [open, member])

  const set = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const nameGiven = draft.name.trim().length > 0

  const submit = async () => {
    if (!nameGiven) return
    if (password && password.length < 10) {
      setPasswordError('A password needs at least 10 characters.')
      return
    }
    if (member) {
      dispatch({ type: 'update-member', member: editMember(member, draft) })
      toast({ title: 'Team member updated', body: `${draft.name.trim()} saved.`, tone: 'success' })
    } else {
      const created = newMember(draft)
      dispatch({ type: 'add-member', member: created, password: password || undefined })
      toast({
        title: 'Team member added',
        body: `${created.name} joins as ${roleLabel(created.role).toLowerCase()}.`,
        tone: 'success',
      })
    }

    /* Replacing an existing member's password is its own endpoint: it
       revokes their sessions, which creating an account does not. */
    if (live && password && member) {
      try {
        await api.setMemberPassword(member.id, password)
        toast({ title: 'Password reset', body: 'Their other sessions have been signed out.', tone: 'success' })
      } catch (err) {
        toast({ title: 'Password not set', body: (err as Error).message, tone: 'critical' })
      }
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${member.name}` : 'Add a team member'}
      subtitle={editing
        ? 'Changing their role changes what they can reach.'
        : 'Their role decides what they can see and do across the platform.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<UserPlus size={14} />} onClick={() => { void submit() }} disabled={!nameGiven}>
            {editing ? 'Save changes' : 'Add to team'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Full name" id="mf-name">
          <Input
            id="mf-name" value={draft.name} autoFocus
            onChange={(e) => set('name', e.target.value)}
            placeholder="Their full name"
          />
        </Field>

        <Field label="Role" id="mf-role" hint={STAFF_ROLE_OPTIONS.find((r) => r.id === draft.role)?.blurb}>
          <Select id="mf-role" value={draft.role} onChange={(e) => set('role', e.target.value as Role)}>
            {STAFF_ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>

        <Field label="Job title" id="mf-title" hint="Left blank, one is taken from the role.">
          <Input id="mf-title" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Property Manager" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" id="mf-email">
            <Input id="mf-email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Direct line" id="mf-phone">
            <Input id="mf-phone" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+256 7…" />
          </Field>
        </div>

        <PropertyAssignment
          role={draft.role}
          chosen={draft.propertyIds}
          onChange={(ids) => set('propertyIds', ids)}
        />

        {live && (
          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              {editing ? 'Reset their password' : 'Their password'}
            </legend>
            <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
              {editing
                ? 'Setting one here replaces whatever they had and signs out every device they were using.'
                : 'Without one they exist on the team but cannot sign in. You can set it later.'}
            </p>
            <Field label={editing ? 'New password' : 'Initial password'} id="mf-password" hint="At least 10 characters. Tell them out of band, and ask them to change it.">
              <Input
                id="mf-password" type="password" autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? 'Leave blank to keep it unchanged' : 'Leave blank for no access yet'}
              />
            </Field>
            {passwordError && (
              <p role="alert" className="mt-2 text-[12px] text-[rgb(var(--c-status-critical))]">{passwordError}</p>
            )}
          </fieldset>
        )}

        <p className="rounded-xl border border-line bg-surface-inset/50 p-3 text-[12px] leading-relaxed text-ink-muted">
          The server enforces this role, not just the interface: a permission it does
          not hold is refused there too, and the database narrows what their queries
          return on top of that.
        </p>
      </div>
    </Modal>
  )
}

/**
 * Which properties a manager or staff member may reach.
 *
 * Not a preference: the database reads these assignments to decide what
 * their queries return, so an empty list for one of those two roles is a
 * person who can sign in and see nothing. Said plainly here, because it
 * is the mistake this form makes easiest.
 */
function PropertyAssignment({
  role, chosen, onChange,
}: { role: Role; chosen: string[]; onChange: (ids: string[]) => void }) {
  const { state } = useStore()
  if (role !== 'manager' && role !== 'staff') {
    return (
      <p className="rounded-xl border border-line bg-surface-inset/50 p-3 text-[12px] leading-relaxed text-ink-muted">
        {roleLabel(role)}s reach the whole portfolio, so there is nothing to assign.
      </p>
    )
  }

  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id])

  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        Properties they work on
      </legend>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
        {chosen.length === 0
          ? 'Nothing assigned yet, which means an empty portfolio when they sign in.'
          : `${chosen.length} of ${state.properties.length}. They see these and the agreements, charges and jobs attached to them.`}
      </p>
      <div className="scroll-y max-h-52 space-y-1 pr-1">
        {state.properties.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] transition-colors hover:bg-surface-inset/60"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--c-gold))]"
              checked={chosen.includes(p.id)}
              onChange={() => toggle(p.id)}
            />
            <span className="text-ink">{p.name}</span>
            <span className="ml-auto text-[11.5px] text-ink-muted">{p.code}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
