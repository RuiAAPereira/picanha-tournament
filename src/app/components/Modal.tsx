import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

type ModalProps = {
  title: string
  onCancel(): void
  children: ReactNode
  /** Where focus goes on close; defaults to the element that had focus when the modal opened. */
  returnFocus?: () => HTMLElement | null
}

/** The page heading (focusable through its own `tabIndex={-1}`) takes focus when the element to return to is gone. */
const pageHeading = () => document.querySelector<HTMLElement>('main h2')

/**
 * Modal shell rendered beside the app root: labelled by its title, the rest of the page is inert, focus
 * moves in and stays inside, Escape cancels, and focus returns on close.
 */
export default function Modal({ title, onCancel, children, returnFocus }: ModalProps) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const [host] = useState(() => {
    const element = document.createElement('div')
    element.className = 'operator'
    return element
  })
  const returnFocusRef = useRef(returnFocus)
  returnFocusRef.current = returnFocus

  useLayoutEffect(() => {
    document.body.appendChild(host)
    const background = [...document.body.children].filter(element => element !== host && !element.hasAttribute('inert'))
    background.forEach(element => element.setAttribute('inert', ''))
    return () => {
      background.forEach(element => element.removeAttribute('inert'))
      host.remove()
    }
  }, [host])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null
    const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? dialog.current)?.focus()
    return () => {
      const target = returnFocusRef.current?.() ?? (opener?.isConnected ? opener : pageHeading())
      target?.focus()
    }
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

  return createPortal(
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
    </div>,
    host,
  )
}
