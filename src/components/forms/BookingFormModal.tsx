import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus } from 'lucide-react'
import { Button, EmptyState, Field, Input, Modal, NumberInput, Select, Textarea } from '../ui'
import { useStore } from '../../lib/store.js'
import {
  advanceFloor, applyPropertyTerms, bookingDraftFrom, editBooking, emptyBookingDraft,
  newBooking, openingCharges, type BookingDraft,
} from '../../lib/create.js'
import { MODE_LABEL, fieldsFor, modeSummary } from '../../lib/agreement.js'
import { holdBlocking, holdsOf, whyBlocked } from '../../lib/occupancy.js'
import { money } from '../../lib/format.js'
import type { Booking, BookingSource, Client, Property, TenancyMode } from '../../lib/types.js'

const MODES: TenancyMode[] = ['long_term', 'rental', 'short_stay']

const SOURCES: Array<[BookingSource, string]> = [
  ['direct', 'Direct'],
  ['airbnb', 'Airbnb'],
  ['booking_com', 'Booking.com'],
  ['agency', 'Agency'],
  ['corporate', 'Corporate'],
]

const nightsBetween = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000))

export function BookingFormModal({
  open, onClose, propertyId, clientId, booking,
}: {
  open: boolean
  onClose: () => void
  propertyId?: string
  /** Opened from a client's record, so it is already about them. */
  clientId?: string
  booking?: Booking
}) {
  const { state, dispatch, toast } = useStore()
  const editing = !!booking

  const lettable = useMemo(
    () => state.properties.filter((p) => p.status !== 'inactive'),
    [state.properties],
  )

  const [draft, setDraft] = useState<BookingDraft>(() =>
    emptyBookingDraft(propertyId ?? lettable[0]?.id ?? '', state.clients[0]?.id ?? ''))

  /* Opening the form should reflect whatever it was opened from — a unit,
     a client, or neither — and pick up that unit's own letting mode and
     rent rather than a stale default. */
  useEffect(() => {
    if (!open) return
    if (booking) { setDraft(bookingDraftFrom(booking)); return }
    const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0]
    const id = propertyId ?? homeOf(client, state.properties, state.bookings)?.id ?? lettable[0]?.id ?? ''
    const property = state.properties.find((p) => p.id === id)
    const base = emptyBookingDraft(id, client?.id ?? '')
    setDraft(property ? applyPropertyTerms(property, base) : base)
  }, [open, propertyId, clientId, booking, lettable, state.properties, state.clients, state.bookings])

  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  /** Choosing a different unit re-prices the agreement — see applyPropertyTerms. */
  const chooseProperty = (id: string) => {
    const property = state.properties.find((p) => p.id === id)
    setDraft((d) => (property ? applyPropertyTerms(property, { ...d, propertyId: id }) : { ...d, propertyId: id }))
  }

  /**
   * Choosing a client moves the agreement to the home they belong to.
   *
   * Somebody is placed in a unit long before an agreement is drawn up —
   * they enquired about flat 4B, they were shown flat 4B, the record says
   * flat 4B. Making the person picking the name then find the same flat a
   * second time in a list of thirty is how the wrong one gets picked, and
   * the wrong one carries the wrong rent. So the home follows the client,
   * with its rent and deposit, and can still be changed by hand.
   */
  const chooseClient = (id: string) => {
    const client = state.clients.find((c) => c.id === id)
    const home = homeOf(client, state.properties, state.bookings)
    setDraft((d) => {
      const next = { ...d, clientId: id }
      return home && home.id !== d.propertyId ? applyPropertyTerms(home, { ...next, propertyId: home.id }) : next
    })
  }

  const chosen = state.properties.find((p) => p.id === draft.propertyId)
  const client = state.clients.find((c) => c.id === draft.clientId)
  const shape = fieldsFor(draft.mode)
  const rental = draft.mode === 'rental'
  const shortStay = draft.mode === 'short_stay'
  const floor = advanceFloor(draft.mode)

  /* Somebody who has not moved out of their last home cannot be placed in
     another one. Found here before the click and refused again on the
     server, so the reason is the same either way. */
  const blocking = useMemo(
    () => (editing ? null : holdBlocking(state.bookings, draft.clientId, draft.propertyId)),
    [editing, state.bookings, draft.clientId, draft.propertyId],
  )
  const blockedBy = blocking && state.properties.find((p) => p.id === blocking.propertyId)

  /** Why the button is off, in the words that would fix it. */
  const problem = useMemo(() => {
    if (!draft.clientId) return 'Choose who the agreement is with.'
    if (!draft.propertyId) return 'Choose the home it is for.'
    if (shape.end && !draft.end) return `Give it ${shortStay ? 'a departure date' : 'an end date'}.`
    if (shape.end && draft.end && draft.end <= draft.start) {
      return shortStay ? 'They cannot leave before they arrive.' : 'The term has to end after it starts.'
    }
    if (draft.rate <= 0) return `Set the ${shape.rateLabel.toLowerCase()} — an agreement at nothing bills nothing.`
    if (blocking && blockedBy && client) return whyBlocked(client.name, blockedBy.name, chosen?.name ?? 'this home')
    return null
  }, [draft, shape, shortStay, blocking, blockedBy, client, chosen])

  /* What the tenant owes on day one, shown before anything is committed —
     the advance is the whole point of a rental, so it should not be a
     surprise discovered later on the payments page. */
  const opening = useMemo(() => {
    const months = rental ? Math.max(1, draft.advanceMonths) : 1
    const nights = shortStay && draft.end ? nightsBetween(draft.start, draft.end) : 0
    const rent = shortStay ? draft.rate * nights : draft.rate * months
    return { rent, months, nights, total: rent + draft.deposit }
  }, [rental, shortStay, draft.advanceMonths, draft.rate, draft.deposit, draft.start, draft.end])

  const submit = () => {
    if (problem) return
    if (booking) {
      dispatch({ type: 'update-booking', booking: editBooking(booking, draft) })
      toast({ title: `Agreement ${booking.reference} updated`, tone: 'success' })
      onClose()
      return
    }
    const created = newBooking(draft, state.bookings)
    const invoices = openingCharges(created, state.invoices)
    dispatch({ type: 'add-booking', booking: created, invoices })
    toast({
      title: `Agreement ${created.reference} created`,
      body: invoices.length
        ? `${client?.name ?? 'The client'} owes ${money(opening.total)} to move in.`
        : `${client?.name ?? 'The client'} is committed to the unit.`,
      tone: 'success',
    })
    onClose()
  }

  const blocked = state.clients.length === 0 || lettable.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${booking.reference}` : 'New agreement'}
      subtitle={editing
        ? 'Charges already raised are unaffected. The unit and client cannot be changed.'
        : 'Commits the unit, links the client and raises the opening charges.'}
      footer={blocked ? (
        <Button variant="secondary" onClick={onClose}>Close</Button>
      ) : (
        <>
          {/* The reason sits beside the button rather than behind a click
              on a disabled one, which tells nobody anything. */}
          {problem && <p className="mr-auto max-w-[60%] self-center text-[12px] leading-snug text-ink-muted">{problem}</p>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<CalendarPlus size={14} />} onClick={submit} disabled={!!problem}>
            {editing ? 'Save changes' : 'Create agreement'}
          </Button>
        </>
      )}
    >
      {blocked ? (
        <EmptyState
          icon={<CalendarPlus size={22} />}
          title={state.clients.length === 0 ? 'No clients yet' : 'No lettable properties'}
          body={state.clients.length === 0
            ? 'An agreement needs someone to sign it. Add a client first, then come back.'
            : 'Every property is marked inactive. Reactivate one before letting it.'}
        />
      ) : (
        <div className="grid gap-5">
          {/* The client comes first: they decide which home the form lands on. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" id="bf-client" hint={editing ? undefined : 'Their home fills in below.'}>
              <Select id="bf-client" value={draft.clientId} disabled={editing} onChange={(e) => chooseClient(e.target.value)}>
                {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field
              label="Property"
              id="bf-prop"
              hint={chosen ? `${MODE_LABEL[chosen.mode]} · ${money(chosen.price)} ${fieldsFor(chosen.mode).rateUnit}` : undefined}
            >
              <Select id="bf-prop" value={draft.propertyId} disabled={editing} onChange={(e) => chooseProperty(e.target.value)}>
                {lettable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>

          {blocking && blockedBy && client && (
            <div className="flex gap-3 rounded-2xl border border-[rgb(var(--c-status-serious)/0.4)] bg-[rgb(var(--c-status-serious)/0.08)] p-4">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[rgb(var(--c-status-serious))]" aria-hidden />
              <div className="text-[12.5px] leading-relaxed text-ink-secondary">
                <p className="font-semibold text-ink">Still in {blockedBy.name}</p>
                <p className="mt-1">
                  {client.name} holds {blockedBy.name} under {blocking.reference}.
                  Check them out of it first — otherwise they would be billed rent for two homes at once.
                </p>
              </div>
            </div>
          )}

          <Field label="Agreement type" id="bf-mode" hint={modeSummary(draft.mode)}>
            <Select id="bf-mode" value={draft.mode} disabled={editing} onChange={(e) => set('mode', e.target.value as TenancyMode)}>
              {MODES.map((v) => <option key={v} value={v}>{MODE_LABEL[v]}</option>)}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={shape.startLabel} id="bf-start">
              <Input id="bf-start" type="date" value={draft.start} onChange={(e) => set('start', e.target.value)} />
            </Field>
            {shape.end ? (
              <Field
                label={shape.endLabel}
                id="bf-end"
                hint={shortStay && draft.end && draft.end > draft.start
                  ? `${nightsBetween(draft.start, draft.end)} nights`
                  : undefined}
              >
                <Input id="bf-end" type="date" min={draft.start} value={draft.end} onChange={(e) => set('end', e.target.value)} />
              </Field>
            ) : (
              <div className="flex items-end pb-1 text-[12.5px] text-ink-muted">
                No end date — the tenant gives {draft.noticeDays} days’ notice.
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={shape.rateLabel}
              id="bf-rate"
              hint={chosen && draft.rate !== chosen.price
                ? `${chosen.name} is listed at ${money(chosen.price)} ${shape.rateUnit}.`
                : 'Taken from the property. Change it here if this agreement differs.'}
            >
              <NumberInput id="bf-rate" min={0} step={10_000} value={draft.rate} onChange={(v) => set('rate', v)} />
            </Field>
            <Field label="Deposit" id="bf-deposit" hint="Refundable; never counted as revenue.">
              <NumberInput id="bf-deposit" min={0} step={10_000} value={draft.deposit} onChange={(v) => set('deposit', v)} />
            </Field>
          </div>

          {(shape.advance || shape.notice) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {shape.advance && (
                <Field
                  label="Months paid up front"
                  id="bf-advance"
                  hint={`At least ${floor}, so a tenant cannot leave after one or two.`}
                >
                  <NumberInput
                    id="bf-advance" min={floor} max={60} stepper
                    value={draft.advanceMonths} onChange={(v) => set('advanceMonths', v)}
                  />
                </Field>
              )}
              {shape.notice && (
                <Field label="Notice required" id="bf-notice" hint="How much warning before they leave.">
                  <NumberInput id="bf-notice" min={0} max={365} suffix="days" value={draft.noticeDays} onChange={(v) => set('noticeDays', v)} />
                </Field>
              )}
            </div>
          )}

          {shape.times && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Arrives after" id="bf-in">
                <Input id="bf-in" type="time" value={draft.checkIn} onChange={(e) => set('checkIn', e.target.value)} />
              </Field>
              <Field label="Leaves by" id="bf-out">
                <Input id="bf-out" type="time" value={draft.checkOut} onChange={(e) => set('checkOut', e.target.value)} />
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={shape.occupantsLabel} id="bf-guests">
              <NumberInput id="bf-guests" min={1} max={99} stepper value={draft.guests} onChange={(v) => set('guests', v)} />
            </Field>
            <Field label="Booked through" id="bf-source">
              <Select id="bf-source" value={draft.source} onChange={(e) => set('source', e.target.value as BookingSource)}>
                {SOURCES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </Select>
            </Field>
          </div>

          {!editing && (
          <div className="rounded-2xl border border-line bg-surface-inset/50 p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Due to move in</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-secondary">
                  {rental
                    ? `Advance · ${opening.months} month${opening.months === 1 ? '' : 's'}`
                    : shortStay
                      ? `Stay · ${opening.nights} night${opening.nights === 1 ? '' : 's'}`
                      : 'First month’s rent'}
                </dt>
                <dd className="tnum text-ink">{money(opening.rent)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-secondary">Refundable deposit</dt>
                <dd className="tnum text-ink">{money(draft.deposit)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="tnum text-ink">{money(opening.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[12px] text-ink-muted">
              Both are raised unpaid — record the payment once the money arrives.
            </p>
          </div>
          )}

          <Field label="Notes" id="bf-notes">
            <Textarea id="bf-notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Handover arrangements, agreed conditions…" />
          </Field>
        </div>
      )}
    </Modal>
  )
}

/**
 * The home a client belongs to.
 *
 * The one they are living in wins: an agreement that has not been checked
 * out of is a fact, and the form should open on it. Failing that, the
 * property their record is linked to — enquired about, viewed, next in
 * line — which is what somebody adding an agreement for them means.
 */
function homeOf(
  client: Client | undefined,
  properties: Property[],
  bookings: Booking[],
): Property | undefined {
  if (!client) return undefined
  const [held] = holdsOf(bookings, client.id)
  if (held) return properties.find((p) => p.id === held.propertyId)
  for (const id of client.propertyIds) {
    const property = properties.find((p) => p.id === id && p.status !== 'inactive')
    if (property) return property
  }
  return undefined
}
