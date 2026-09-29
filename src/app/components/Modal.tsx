import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

type ModalProps = { title: string; onCancel(): void; children: ReactNode }

/** Modal shell: labelled by its title, takes focus, keeps Tab inside, Escape cancels, focus returns on close. */
export default function Modal({ title, onCancel, children }: ModalProps) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? dialog.current)?.focus()
    return () => opener?.focus()
  }, [])

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !dialog.current) return
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const [first, last] = [items[0], items[items.length - 1]]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
