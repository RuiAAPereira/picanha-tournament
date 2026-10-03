import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PresentationSnapshot, PresentationState, PresentationUpdate } from '../presentation/presentationState'
import { projectPresentation, projectResting } from '../presentation/projection'
import type { PresentationPort, PresentationSignal } from './presentationPort'
import type { InvokeFn } from './tournamentRepository'

/** Events the Rust side emits: `state` and `skip` to the TV, `muted` to both windows, `closed` to the operator. */
export const PRESENTATION_EVENTS = {
  state: 'presentation-state',
  skip: 'presentation-skip',
  muted: 'presentation-muted',
  closed: 'presentation-closed',
} as const

/** Mirrors `PresentationErrorCode` in src-tauri/src/presentation/store.rs. */
export const PRESENTATION_ERROR_CODES = ['window_closed', 'window_failed', 'unexpected'] as const

export type PresentationErrorCode = typeof PRESENTATION_ERROR_CODES[number]

/** `message` is European Portuguese and safe to show. */
export type PresentationError = { code: PresentationErrorCode; message: string }

/** Mirrors the `Unexpected` message in src-tauri/src/presentation/store.rs. */
export const GENERIC_PRESENTATION_ERROR_MESSAGE = 'Ocorreu um erro inesperado na apresentação.'

export type ListenFn = (event: string, handler: (message: { payload: unknown }) => void) => Promise<() => void>

export type PresentationController = {
  /** Opens the TV window, or shows and focuses it; a closed window is replaced. */
  open(): Promise<void>
  /** Sends a TV state. Idle states, and `reveal: false`, appear at once, without animation or sound. */
  publishPresentation(state: PresentationState, options?: { reveal?: boolean }): Promise<void>
  /** Completes the running reveal at once. */
  skip(): Promise<void>
  setMuted(muted: boolean): Promise<void>
}

/** The operator's controller: the TV-state methods above plus the session's `PresentationPort`. */
export type TauriPresentation = PresentationController & Required<PresentationPort>

const isPresentationError = (value: unknown): value is PresentationError =>
  typeof value === 'object' && value !== null
  && (PRESENTATION_ERROR_CODES as readonly unknown[]).includes((value as { code?: unknown }).code)
  && typeof (value as { message?: unknown }).message === 'string'

const toPresentationError = (error: unknown): PresentationError => {
  if (isPresentationError(error)) return { code: error.code, message: error.message }
  console.error('[presentation]', error)
  return { code: 'unexpected', message: GENERIC_PRESENTATION_ERROR_MESSAGE }
}

async function call<T>(invokeFn: InvokeFn, command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return (await (args === undefined ? invokeFn(command) : invokeFn(command, args))) as T
  } catch (error) {
    throw toPresentationError(error)
  }
}

/** Listens to one event; outside Tauri (tests, plain browser) it quietly does nothing. */
export function subscribeTo<T>(listenFn: ListenFn, event: string, handler: (payload: T) => void): () => void {
  let active = true
  const pending = listenFn(event, message => {
    if (active) handler(message.payload as T)
  }).catch(() => undefined)
  return () => {
    active = false
    // A listener still being registered is removed as soon as it is ready.
    void pending.then(unlisten => unlisten?.())
  }
}

/**
 * `clock` seeds the publish sequence, so it keeps increasing across operator reloads while the
 * app (and the stored update) lives on.
 */
export function createTauriPresentationController(
  invokeFn: InvokeFn = invoke,
  listenFn: ListenFn = listen,
  clock: () => number = Date.now,
): TauriPresentation {
  let lastSeq = 0
  const nextSeq = () => (lastSeq = Math.max(clock(), lastSeq + 1))

  const publishPresentation = async (state: PresentationState, options: { reveal?: boolean } = {}) => {
    const update: PresentationUpdate = { seq: nextSeq(), reveal: (options.reveal ?? true) && state.kind !== 'idle', state }
    await call<void>(invokeFn, 'publish_presentation_state', { update })
  }

  return {
    open: () => call<void>(invokeFn, 'open_presentation_window'),
    publishPresentation,
    publish: (state, event) => publishPresentation(projectPresentation(state, event)),
    seed: state => publishPresentation(projectResting(state), { reveal: false }),
    skip: () => call<void>(invokeFn, 'skip_presentation'),
    setMuted: muted => call<void>(invokeFn, 'set_presentation_muted', { muted }),
    readMuted: async () => (await fetchPresentationSnapshot(invokeFn))?.muted ?? false,
    subscribe(listener: (signal: PresentationSignal) => void) {
      const stops = [
        subscribeTo<boolean>(listenFn, PRESENTATION_EVENTS.muted, muted => listener({ type: 'muted', muted })),
        subscribeTo<null>(listenFn, PRESENTATION_EVENTS.closed, () => listener({ type: 'closed' })),
      ]
      return () => stops.forEach(stop => stop())
    },
  }
}

/** The newest update and sound setting, read by a window when it starts. */
export const fetchPresentationSnapshot = (invokeFn: InvokeFn = invoke) =>
  call<PresentationSnapshot | null>(invokeFn, 'get_presentation_state')

/** Sets the sound from the TV window itself, so a reopened window and the operator keep it. */
export const storePresentationMuted = (muted: boolean, invokeFn: InvokeFn = invoke) =>
  call<void>(invokeFn, 'set_presentation_muted', { muted })
