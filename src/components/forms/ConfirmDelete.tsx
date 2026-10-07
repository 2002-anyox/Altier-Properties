import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button, Modal } from '../ui'

/**
 * A removal that cannot be undone deserves to say what it takes with it.
 * `consequences` is the list of records that go too — counted, named, and
 * shown before the button is pressed rather than discovered afterwards.
 *
 * `blockers` is the other case: records that mean the removal is refused.
 * Those used to be passed as consequences, so a client with nine
 * agreements was shown "This also removes: 9 agreements · This cannot be
 * undone" beside a red "Try anyway" — and then the server, rightly,
 * refused. A dialog that describes a deletion that is not going to happen
 * teaches people to stop reading dialogs. When anything blocks, there is
 * no destructive button at all, and `alternative` offers the thing that
 * can be done instead.
 */
export function ConfirmDelete({
  open, onClose, onConfirm, title, subject, consequences = [], blockers = [],
  alternative, confirmLabel = 'Delete',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  subject: string
  consequences?: string[]
  blockers?: string[]
  alternative?: { label: string; onSelect: () => void }
  confirmLabel?: string
}) {
  const blocked = blockers.length > 0
  const listed = blocked ? blockers : consequences
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        blocked ? (
          <>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {alternative && (
              <Button variant="primary" onClick={() => { alternative.onSelect(); onClose() }}>
                {alternative.label}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              icon={<Trash2 size={14} />}
              className="!bg-[rgb(var(--c-status-critical))] hover:!bg-[rgb(var(--c-status-critical))]/90"
              onClick={() => { onConfirm(); onClose() }}
            >
              {confirmLabel}
            </Button>
          </>
        )
      }
    >
      <div className="flex gap-3.5">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-critical-soft text-status-critical-ink"
          aria-hidden
        >
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] leading-relaxed text-ink">{subject}</p>
          {listed.length > 0 && (
            <>
              <p className="mt-3 text-[12.5px] font-medium text-ink-secondary">
                {blocked ? 'It is held by:' : 'This also removes:'}
              </p>
              <ul className="mt-1.5 space-y-1 text-[13px] text-ink-secondary">
                {listed.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-ink-muted" aria-hidden>·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!blocked && <p className="mt-3 text-[12.5px] text-ink-muted">This cannot be undone.</p>}
        </div>
      </div>
    </Modal>
  )
}
