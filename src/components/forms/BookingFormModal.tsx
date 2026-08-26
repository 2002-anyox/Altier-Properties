import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, EmptyState, Field, Input, Modal, Select, Textarea } from '../ui'
import { useStore } from '../../lib/store'
import {
  advanceFloor, bookingDraftFrom, editBooking, emptyBookingDraft, newBooking,
  openingCharges, type BookingDraft,
} from '../../lib/create'
import { money } from '../../lib/format'
import type { Booking, BookingSource, TenancyMode } from '../../lib/types'

const MODES: Array<[TenancyMode, string]> = [
  ['long_term', 'Fixed-term lease'],
  ['rental', 'Open-ended rental'],
  ['short_stay', 'Short stay'],
]

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
  open, onClose, propertyId, booking,
}: { open: boolean; onClose: () => void; propertyId?: string; booking?: Booking }) {
  const { state, dispatch, toast } = useStore()
  const editing = !!booking

  const lettable = useMemo(
    () => state.properties.filter((p) => p.status !== 'inactive'),
    [state.properties],
  )

  const [draft, setDraft] = useState<BookingDraft>(() =>
    emptyBookingDraft(propertyId ?? lettable[0]?.id ?? '', state.clients[0]?.id ?? ''))

  /* Opening the form should reflect the unit it was opened from, and pick
     up that unit's own letting mode and rent rather than a stale default. */
  useEffect(() => {
    if (!open) return
    if (booking) { setDraft(bookingDraftFrom(booking)); return }
    const id = propertyId ?? lettable[0]?.id ?? ''
    const property = state.properties.find((p) => p.id === id)
    const base = emptyBookingDraft(id, state.clients[0]?.id ?? '')
    setDraft(property
      ? {
          ...base,
          mode: property.mode,
          rate: property.price,
          deposit: property.mode === 'short_stay' ? Math.round(property.price * 1.5) : property.price * 2,
          advanceMonths: advanceFloor(property.mode) || base.advanceMonths,
        }
      : base)
  }, [open, propertyId, booking, lettable, state.properties, state.clients])

  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const rental = draft.mode === 'rental'
  const shortStay = draft.mode === 'short_stay'
  const floor = advanceFloor(draft.mode)
  const ready = !!draft.propertyId && !!draft.clientId && (rental || !!draft.end)

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
    if (!ready) return
    if (booking) {
      dispatch({ type: 'update-booking', booking: editBooking(booking, draft) })
      toast({ title: `Agreement ${booking.reference} updated`, tone: 'success' })
      onClose()
      return
    }
    const created = newBooking(draft, state.bookings)
    const invoices = openingCharges(created, state.invoices)
    dispatch({ type: 'add-booking', booking: created, invoices })
    const client = state.clients.find((c) => c.id === created.clientId)
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
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<CalendarPlus size={14} />} onClick={submit} disabled={!ready}>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property" id="bf-prop">
              <Select id="bf-prop" value={draft.propertyId} disabled={editing} onChange={(e) => set('propertyId', e.target.value)}>
                {lettable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Client" id="bf-client">
              <Select id="bf-client" value={draft.clientId} disabled={editing} onChange={(e) => set('clientId', e.target.value)}>
                {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>

          <Field
            label="Agreement type"
            id="bf-mode"
            hint={rental
              ? `Open-ended — it runs until notice is given. At least ${floor} months are taken up front.`
              : shortStay
                ? 'Nightly, with a fixed departure date.'
                : 'A fixed term with an agreed end date.'}
          >
            <Select id="bf-mode" value={draft.mode} disabled={editing} onChange={(e) => set('mode', e.target.value as TenancyMode)}>
              {MODES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={shortStay ? 'Arrival' : 'Starts'} id="bf-start">
              <Input id="bf-start" type="date" value={draft.start} onChange={(e) => set('start', e.target.value)} />
            </Field>
            {rental ? (
              <div className="flex items-end pb-1 text-[12.5px] text-ink-muted">
                No end date — the tenant gives {draft.noticeDays} days' notice.
              </div>
            ) : (
              <Field label={shortStay ? 'Departure' : 'Ends'} id="bf-end">
                <Input id="bf-end" type="date" min={draft.start} value={draft.end} onChange={(e) => set('end', e.target.value)} />
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={shortStay ? 'Nightly rate' : 'Monthly rent'} id="bf-rate">
              <Input id="bf-rate" type="number" min={0} step={1000} value={draft.rate} onChange={(e) => set('rate', Number(e.target.value))} />
            </Field>
            <Field label="Deposit" id="bf-deposit" hint="Refundable; never counted as revenue.">
              <Input id="bf-deposit" type="number" min={0} step={1000} value={draft.deposit} onChange={(e) => set('deposit', Number(e.target.value))} />
            </Field>
          </div>

          {rental && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Months paid up front"
                id="bf-advance"
                hint={`At least ${floor}, so a tenant cannot leave after one or two.`}
              >
                <Input
                  id="bf-advance" type="number" min={floor} value={draft.advanceMonths}
                  onChange={(e) => set('advanceMonths', Math.max(floor, Number(e.target.value)))}
                />
              </Field>
              <Field label="Notice required (days)" id="bf-notice">
                <Input id="bf-notice" type="number" min={0} value={draft.noticeDays} onChange={(e) => set('noticeDays', Number(e.target.value))} />
              </Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={shortStay ? 'Guests' : 'Occupants'} id="bf-guests">
              <Input id="bf-guests" type="number" min={1} value={draft.guests} onChange={(e) => set('guests', Number(e.target.value))} />
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
