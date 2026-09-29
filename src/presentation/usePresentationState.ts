import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { fetchPresentationSnapshot, PRESENTATION_EVENTS, storePresentationMuted } from '../platform/presentation'
import type { PresentationState } from './presentationState'

export type RevealStatus = 'playing' | 'done'

export type PresentationFeed = {
  state: PresentationState | null
  /** Changes with every state published while the window is open; each starts a new reveal. */
  revealKey: number
  reveal: RevealStatus
  completeReveal(): void
  muted: boolean
  setMuted(muted: boolean): void
}

type Shown = { state: PresentationState | null; revealKey: number; reveal: RevealStatus }
type Action =
  | { type: 'live'; state: PresentationState }
  | { type: 'restored'; state: PresentationState }
  | { type: 'complete' }

function reduce(shown: Shown, action: Action): Shown {
  switch (action.type) {
    case 'live': return { state: action.state, revealKey: shown.revealKey + 1, reveal: 'playing' }
    // A state published before the window opened is shown as is; its moment has passed.
    case 'restored': return { ...shown, state: action.state, reveal: 'done' }
    case 'complete': return shown.reveal === 'done' ? shown : { ...shown, reveal: 'done' }
  }
}

/** Listens to one Rust event; outside Tauri (tests, plain browser) it quietly does nothing. */
const subscribe = <T>(event: string, handler: (payload: T) => void) =>
  listen<T>(event, message => handler(message.payload)).catch(() => undefined)

/**
 * The state the TV shows. With `initialState` (tests, previews) nothing is fetched or subscribed.
 * Otherwise it reads the last published state on mount, so a state published before the listener was
 * ready is never lost, then follows `presentation-state`, `presentation-skip` and `presentation-muted`.
 */
export function usePresentationState(initialState?: PresentationState): PresentationFeed {
  const [shown, dispatch] = useReducer(reduce, {
    state: initialState ?? null, revealKey: 0, reveal: 'done',
  })
  const [muted, setMutedState] = useState(false)
  const mutedTouched = useRef(false)
  const live = !initialState

  useEffect(() => {
    if (!live) return
    let active = true
    let received = false
    const guard = <T>(handler: (payload: T) => void) => (payload: T) => {
      if (active) handler(payload)
    }
    const unlisteners = [
      subscribe<PresentationState>(PRESENTATION_EVENTS.state, guard(state => {
        received = true
        dispatch({ type: 'live', state })
      })),
      subscribe<null>(PRESENTATION_EVENTS.skip, guard(() => dispatch({ type: 'complete' }))),
      subscribe<boolean>(PRESENTATION_EVENTS.muted, guard(next => {
        mutedTouched.current = true
        setMutedState(next)
      })),
    ]
    // Read only once the listeners are registered, so nothing published in between is missed.
    Promise.all(unlisteners)
      .then(() => (active ? fetchPresentationSnapshot() : null))
      .then(snapshot => {
        if (!active || !snapshot) return
        if (!received && snapshot.state) dispatch({ type: 'restored', state: snapshot.state })
        if (!mutedTouched.current) setMutedState(snapshot.muted)
      })
      .catch(() => {})
    return () => {
      active = false
      // A listener still being registered is removed as soon as it is ready.
      unlisteners.forEach(pending => void pending.then(unlisten => unlisten?.()))
    }
  }, [live])

  const completeReveal = useCallback(() => dispatch({ type: 'complete' }), [])
  const setMuted = useCallback((next: boolean) => {
    mutedTouched.current = true
    setMutedState(next)
    // Stored in the app, so a reopened TV window keeps the setting.
    void storePresentationMuted(next).catch(() => {})
  }, [])

  return { ...shown, completeReveal, muted, setMuted }
}
