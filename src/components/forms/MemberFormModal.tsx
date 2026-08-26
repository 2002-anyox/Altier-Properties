import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '../ui'
import { useStore } from '../../lib/store'
import {
  editMember, emptyMemberDraft, memberDraftFrom, newMember, type MemberDraft,
} from '../../lib/create'
import { ROLES, roleLabel } from '../../lib/rbac'
import type { Role, TeamMember } from '../../lib/types'

export function MemberFormModal({
  open, onClose, member,
}: { open: boolean; onClose: () => void; member?: TeamMember }) {
  const { dispatch, toast } = useStore()
  const editing = !!member
  const [draft, setDraft] = useState<MemberDraft>(() =>
    member ? memberDraftFrom(member) : emptyMemberDraft())

  useEffect(() => {
    if (open) setDraft(member ? memberDraftFrom(member) : emptyMemberDraft())
  }, [open, member])

  const set = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const nameGiven = draft.name.trim().length > 0

  const submit = () => {
    if (!nameGiven) return
    if (member) {
      dispatch({ type: 'update-member', member: editMember(member, draft) })
      toast({ title: 'Team member updated', body: `${draft.name.trim()} saved.`, tone: 'success' })
    } else {
      const created = newMember(draft)
      dispatch({ type: 'add-member', member: created })
      toast({
        title: 'Team member added',
        body: `${created.name} joins as ${roleLabel(created.role).toLowerCase()}.`,
        tone: 'success',
      })
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
          <Button variant="primary" icon={<UserPlus size={14} />} onClick={submit} disabled={!nameGiven}>
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

        <p className="rounded-xl border border-line bg-surface-inset/50 p-3 text-[12px] leading-relaxed text-ink-muted">
          Roles govern what this platform shows and allows. They are not a sign-in —
          Altier has no login yet, so anyone who can reach the address can switch between them.
        </p>
      </div>
    </Modal>
  )
}
