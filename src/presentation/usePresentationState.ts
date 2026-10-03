import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  fetchPresentationSnapshot, PRESENTATION_EVENTS, storePresentationMuted, subscribeTo, type ListenFn,
} from '../platform/presentation'
import type { PresentationState, PresentationUpdate } from './presentationState'

export type RevealStatus = 'playing' | 'done'

export type PresentationFeed = {
  state: PresentationState | null
  /** Changes with every update that starts a reveal (and its sound). */
  revealKey: number
  reveal: RevealStatus
  completeReveal(): void
  muted: boolean
  /** False until the stored sound setting is known; nothing should sound before. */
  muteKnown: boolean
  setMuted(muted: boolean): void
}

type Shown = { state: PresentationState | null; seq: number; revealKey: number; reveal: RevealStatus }
type Action =
  | { type: 'update'; update: PresentationUpdate; live: boolean }
  | { type: 'complete' }

function reduce(shown: Shown, action: Action): Shown {
  switch (action.type) {
    case 'update': {
      const { update, live } = action
      // Updates can arrive out of order (event versus initial read); the newest one wins.
      if (update.seq <= shown.seq) return shown
      // Only a live update with a reveal animates; one read on mount has had its moment.
      if (live && update.reveal) {
        return { state: update.state, seq: update.seq, revealKey: shown.revealKey + 1, reveal: 'playing' }
      }
      return { ...shown, state: update.state, seq: update.seq, reveal: 'done' }
    }
    case 'complete': return shown.reveal === 'done' ? shown : { ...shown, reveal: 'done' }
  }
}

/**
 * The state the TV shows. With `initialState` (tests, previews) nothing is fetched or subscribed.
 * Otherwise it listens to `presentation-state`, `presentation-skip` and `presentation-muted`, then
 * reads the newest update, so nothing published in between is lost.
 */
export function usePresentationState(initialState?: PresentationState): PresentationFeed {
  const [shown, dispatch] = useReducer(reduce, {
    state: initialState ?? null, seq: 0, revealKey: 0, reveal: 'done',
  })
  const live = !initialState
  const [muted, setMutedState] = useState(false)
  const [muteKnown, setMuteKnown] = useState(!live)
  const mutedTouched = useRef(false)

  useEffect(() => {
    if (!live) return
    let active = true
    const listenFn = listen as ListenFn
    const knowMuted = (next: boolean) => {
      mutedTouched.current = true
      setMutedState(next)
      setMuteKnown(true)
    }
    const listening: Promise<unknown>[] = []
    const track = (event: string, handler: (payload: never) => void) => subscribeTo(
      (name, callback) => {
        const pending = listenFn(name, callback)
        listening.push(pending.catch(() => undefined))
        return pending
      },
      event,
      handler,
    )
    const stops = [
      track(PRESENTATION_EVENTS.state, (update: PresentationUpdate) => dispatch({ type: 'update', update, live: true })),
      track(PRESENTATION_EVENTS.skip, () => dispatch({ type: 'complete' })),
      track(PRESENTATION_EVENTS.muted, (next: boolean) => knowMuted(next)),
    ]
    // Read only once the listeners are registered, so nothing published in between is missed.
    Promise.all(listening)
      .then(() => (active ? fetchPresentationSnapshot() : null))
      .then(snapshot => {
        if (!active) return
        if (snapshot?.update) dispatch({ type: 'update', update: snapshot.update, live: false })
        if (!mutedTouched.current) setMutedState(snapshot?.muted ?? false)
      })
      .catch(() => {})
      // Known, or unknowable (outside Tauri): sound may start from here.
      .finally(() => {
        if (active) setMuteKnown(true)
      })
    return () => {
      active = false
      stops.forEach(stop => stop())
    }
  }, [live])

  const completeReveal = useCallback(() => dispatch({ type: 'complete' }), [])
  const setMuted = useCallback((next: boolean) => {
    mutedTouched.current = true
    setMutedState(next)
    // Stored in the app, so a reopened TV window and the operator keep the setting.
    void storePresentationMuted(next).catch(() => {})
  }, [])

  return { state: shown.state, revealKey: shown.revealKey, reveal: shown.reveal, completeReveal, muted, muteKnown, setMuted }
}
