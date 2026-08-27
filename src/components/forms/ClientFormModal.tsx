import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '../ui'
import { useStore } from '../../lib/store.js'
import {
  clientDraftFrom, editClient, emptyClientDraft, newClient, type ClientDraft,
} from '../../lib/create.js'
import type { Client, ClientKind } from '../../lib/types.js'

const KINDS: Array<[ClientKind, string]> = [
  ['tenant', 'Tenant'],
  ['guest', 'Short-stay guest'],
  ['corporate', 'Corporate'],
  ['owner', 'Owner'],
]

const STATUSES: Array<[Client['status'], string, string]> = [
  ['prospect', 'Prospect', 'Enquired but not yet committed to a unit.'],
  ['active', 'Active', 'Currently in one of your properties.'],
  ['past', 'Past', 'Has left, kept for history.'],
]

/** One form for both intake and editing, as with properties. */
export function ClientFormModal({
  open, onClose, client,
}: { open: boolean; onClose: () => void; client?: Client }) {
  const { state, dispatch, toast } = useStore()
  const editing = !!client
  const [draft, setDraft] = useState<ClientDraft>(() =>
    client ? clientDraftFrom(client) : emptyClientDraft())

  useEffect(() => {
    if (open) setDraft(client ? clientDraftFrom(client) : emptyClientDraft())
  }, [open, client])

  const set = <K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const nameGiven = draft.name.trim().length > 0

  const submit = () => {
    if (!nameGiven) return
    if (client) {
      dispatch({ type: 'update-client', client: editClient(client, draft) })
      toast({ title: 'Client updated', body: `${draft.name.trim()} saved.`, tone: 'success' })
    } else {
      const created = newClient(draft)
      dispatch({ type: 'add-client', client: created })
      toast({
        title: 'Client added',
        body: `${created.name} is on file. Create an agreement to place them in a unit.`,
        tone: 'success',
      })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${client.name}` : 'Add a client'}
      subtitle={editing
        ? 'Documents, payment history and communications are unaffected.'
        : 'Only the name is required. Identity documents can be attached from their profile.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<UserPlus size={14} />} onClick={submit} disabled={!nameGiven}>
            {editing ? 'Save changes' : 'Add client'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Field label="Full name" id="cf-name">
          <Input
            id="cf-name" value={draft.name} autoFocus
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Miriam Nakabugo"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" id="cf-kind">
            <Select id="cf-kind" value={draft.kind} onChange={(e) => set('kind', e.target.value as ClientKind)}>
              {KINDS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          </Field>
          <Field
            label="Standing"
            id="cf-status"
            hint={STATUSES.find(([v]) => v === draft.status)?.[2]}
          >
            <Select id="cf-status" value={draft.status} onChange={(e) => set('status', e.target.value as Client['status'])}>
              {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" id="cf-email">
            <Input id="cf-email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Phone" id="cf-phone">
            <Input id="cf-phone" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+256 7…" />
          </Field>
          <Field label="Nationality" id="cf-nat">
            <Input id="cf-nat" value={draft.nationality} onChange={(e) => set('nationality', e.target.value)} />
          </Field>
          <Field label="Emergency contact" id="cf-emg" hint="Name and number.">
            <Input id="cf-emg" value={draft.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} placeholder="Samuel Odongo · +256 7…" />
          </Field>
        </div>

        {state.properties.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-[12.5px] font-medium text-ink-secondary">Associated properties</legend>
            <p className="mb-2.5 text-[12px] text-ink-muted">
              Optional. Creating an agreement links them automatically.
            </p>
            <div className="grid max-h-44 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {state.properties.map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.name}
                  checked={draft.propertyIds.includes(p.id)}
                  onChange={(on) => set('propertyIds', on
                    ? [...draft.propertyIds, p.id]
                    : draft.propertyIds.filter((id) => id !== p.id))}
                />
              ))}
            </div>
          </fieldset>
        )}

        <Field label="Notes" id="cf-notes">
          <Textarea id="cf-notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Referral source, payment preferences, anything worth remembering…" />
        </Field>
      </div>
    </Modal>
  )
}
