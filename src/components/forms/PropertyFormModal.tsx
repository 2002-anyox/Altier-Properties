import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import {
  Button, Checkbox, Field, Input, Modal, PROPERTY_STATUS_META, Select, Textarea,
} from '../ui'
import { useStore } from '../../lib/store'
import {
  AMENITY_CHOICES, editProperty, emptyPropertyDraft, newProperty, propertyDraftFrom,
  type PropertyDraft,
} from '../../lib/create'
import { BASE_CURRENCY } from '../../lib/money'
import type { Property, PropertyStatus, PropertyType, TenancyMode } from '../../lib/types'

const TYPES: Array<[PropertyType, string]> = [
  ['apartment', 'Apartment'],
  ['house', 'House'],
  ['villa', 'Villa'],
  ['serviced', 'Serviced apartment'],
  ['short_stay', 'Short-stay unit'],
  ['commercial', 'Commercial'],
]

const MODES: Array<[TenancyMode, string, string]> = [
  ['long_term', 'Fixed-term lease', 'A lease with an agreed end date.'],
  ['rental', 'Open-ended rental', 'Runs until the tenant gives notice; opened with an advance.'],
  ['short_stay', 'Short stay', 'Nightly bookings — the rate below is per night.'],
]

/**
 * One form for both intake and editing. `property` present means edit; the
 * fields it does not cover — occupancy history, documents, the record's
 * identity — are carried through untouched by editProperty.
 */
export function PropertyFormModal({
  open, onClose, property,
}: { open: boolean; onClose: () => void; property?: Property }) {
  const { state, dispatch, toast } = useStore()
  const editing = !!property
  const [draft, setDraft] = useState<PropertyDraft>(() =>
    property ? propertyDraftFrom(property) : emptyPropertyDraft(state.currentUserId))

  /* Reopening for a different record must not show the last one's values. */
  useEffect(() => {
    if (open) setDraft(property ? propertyDraftFrom(property) : emptyPropertyDraft(state.currentUserId))
  }, [open, property, state.currentUserId])

  const set = <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const nameGiven = draft.name.trim().length > 0
  const rateLabel = draft.mode === 'short_stay' ? 'Nightly rate' : 'Monthly rent'

  const submit = () => {
    if (!nameGiven) return
    if (property) {
      dispatch({ type: 'update-property', property: editProperty(property, draft) })
      toast({ title: 'Property updated', body: `${draft.name.trim()} saved.`, tone: 'success' })
    } else {
      const created = newProperty(draft, state.properties)
      dispatch({ type: 'add-property', property: created })
      toast({
        title: 'Property added',
        body: `${created.name} joins the portfolio as ${created.code}.`,
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
      title={editing ? `Edit ${property.name}` : 'Add a property'}
      subtitle={editing
        ? 'Occupancy history, documents and charges are unaffected.'
        : 'Only the name is required — the rest can be filled in later.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Building2 size={14} />} onClick={submit} disabled={!nameGiven}>
            {editing ? 'Save changes' : 'Add property'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Field label="Property name" id="pf-name" hint="How it appears everywhere in the platform.">
          <Input
            id="pf-name" value={draft.name} autoFocus
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Kololo Terrace 4B"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" id="pf-type">
            <Select id="pf-type" value={draft.type} onChange={(e) => set('type', e.target.value as PropertyType)}>
              {TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Status" id="pf-status">
            <Select id="pf-status" value={draft.status} onChange={(e) => set('status', e.target.value as PropertyStatus)}>
              {(Object.keys(PROPERTY_STATUS_META) as PropertyStatus[]).map((s) => (
                <option key={s} value={s}>{PROPERTY_STATUS_META[s].label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="How it is let"
          id="pf-mode"
          hint={MODES.find(([v]) => v === draft.mode)?.[2]}
        >
          <Select id="pf-mode" value={draft.mode} onChange={(e) => set('mode', e.target.value as TenancyMode)}>
            {MODES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>

        <fieldset className="grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-2">
          <legend className="px-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Address</legend>
          <Field label="Street or building" id="pf-line1">
            <Input id="pf-line1" value={draft.line1} onChange={(e) => set('line1', e.target.value)} placeholder="e.g. 14 Acacia Avenue" />
          </Field>
          <Field label="Area or suburb" id="pf-district" hint="Groups the unit on the portfolio map.">
            <Input id="pf-district" value={draft.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Kololo" />
          </Field>
          <Field label="District" id="pf-city">
            <Input id="pf-city" value={draft.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Country" id="pf-country">
            <Input id="pf-country" value={draft.country} onChange={(e) => set('country', e.target.value)} />
          </Field>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bedrooms" id="pf-beds">
            <Input id="pf-beds" type="number" min={0} value={draft.bedrooms} onChange={(e) => set('bedrooms', Number(e.target.value))} />
          </Field>
          <Field label="Bathrooms" id="pf-baths">
            <Input id="pf-baths" type="number" min={0} value={draft.bathrooms} onChange={(e) => set('bathrooms', Number(e.target.value))} />
          </Field>
          <Field label="Size (m²)" id="pf-size">
            <Input id="pf-size" type="number" min={0} value={draft.sizeSqm} onChange={(e) => set('sizeSqm', Number(e.target.value))} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={rateLabel} id="pf-price" hint={`Held in ${BASE_CURRENCY}, shown in your chosen currency.`}>
            <Input id="pf-price" type="number" min={0} step={1000} value={draft.price} onChange={(e) => set('price', Number(e.target.value))} />
          </Field>
          <Field label="Assigned manager" id="pf-manager">
            <Select id="pf-manager" value={draft.managerId} onChange={(e) => set('managerId', e.target.value)}>
              {state.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        </div>

        {draft.status === 'available' && (
          <Field label="Available from" id="pf-available" hint="Drives the “becoming available” views.">
            <Input
              id="pf-available" type="date" value={draft.availableFrom ?? ''}
              onChange={(e) => set('availableFrom', e.target.value || null)}
            />
          </Field>
        )}

        <fieldset>
          <legend className="mb-2.5 text-[12.5px] font-medium text-ink-secondary">Amenities</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {AMENITY_CHOICES(draft.type).map((amenity) => (
              <Checkbox
                key={amenity}
                label={amenity}
                checked={draft.amenities.includes(amenity)}
                onChange={(on) => set('amenities', on
                  ? [...draft.amenities, amenity]
                  : draft.amenities.filter((a) => a !== amenity))}
              />
            ))}
          </div>
        </fieldset>

        <Field label="Notes" id="pf-notes" hint="Anything a manager should know before viewing.">
          <Textarea id="pf-notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Access, quirks, owner preferences…" />
        </Field>
      </div>
    </Modal>
  )
}
