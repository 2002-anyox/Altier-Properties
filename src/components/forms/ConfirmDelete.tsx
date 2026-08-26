import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button, Modal } from '../ui'

/**
 * A removal that cannot be undone deserves to say what it takes with it.
 * `consequences` is the list of records that go too — counted, named, and
 * shown before the button is pressed rather than discovered afterwards.
 */
export function ConfirmDelete({
  open, onClose, onConfirm, title, subject, consequences = [], confirmLabel = 'Delete',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  subject: string
  consequences?: string[]
  confirmLabel?: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
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
      }
    >
      <div className="flex gap-3.5">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--c-status-critical)/0.12)] text-[rgb(var(--c-status-critical))]"
          aria-hidden
        >
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] leading-relaxed text-ink">{subject}</p>
          {consequences.length > 0 && (
            <>
              <p className="mt-3 text-[12.5px] font-medium text-ink-secondary">This also removes:</p>
              <ul className="mt-1.5 space-y-1 text-[13px] text-ink-secondary">
                {consequences.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-ink-muted" aria-hidden>·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-[12.5px] text-ink-muted">This cannot be undone.</p>
        </div>
      </div>
    </Modal>
  )
}
