import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '../ui'
import { useStore } from '../../lib/store'
import { api } from '../../lib/api'
import {
  editMember, emptyMemberDraft, memberDraftFrom, newMember, type MemberDraft,
} from '../../lib/create'
import { ROLES, roleLabel } from '../../lib/rbac'
import type { Role, TeamMember } from '../../lib/types'

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
            placeholder="e.g. Ronald Okello"
          />
        </Field>

        <Field label="Role" id="mf-role" hint={ROLES.find((r) => r.id === draft.role)?.blurb}>
          <Select id="mf-role" value={draft.role} onChange={(e) => set('role', e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>

        <Field label="Job title" id="mf-title" hint="Left blank, one is taken from the role.">
          <Input id="mf-title" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Property Manager" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" id="mf-email">
            <Input id="mf-email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="name@altier.co.ug" />
          </Field>
          <Field label="Direct line" id="mf-phone">
            <Input id="mf-phone" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+256 7…" />
          </Field>
        </div>

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
          {live
            ? 'The server enforces this role, not just the interface: a permission it does not hold is refused there too.'
            : 'With no database behind it there is nobody to sign in as, so roles here only demonstrate what each one may reach.'}
        </p>
      </div>
    </Modal>
  )
}
