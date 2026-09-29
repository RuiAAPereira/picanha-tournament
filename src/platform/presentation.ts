import { invoke } from '@tauri-apps/api/core'
import type { TournamentState } from '../domain/tournament'
import type { PresentationSnapshot, PresentationState } from '../presentation/presentationState'
import { projectPresentation } from '../presentation/projection'
import type { PresentationPort, SessionEvent } from './presentationPort'
import type { InvokeFn } from './tournamentRepository'

/** Events the Rust side emits to the `presentation` window only. */
export const PRESENTATION_EVENTS = {
  state: 'presentation-state',
  skip: 'presentation-skip',
  muted: 'presentation-muted',
} as const

/** Mirrors `PresentationErrorCode` in src-tauri/src/presentation.rs. */
export const PRESENTATION_ERROR_CODES = ['window_closed', 'window_failed', 'unexpected'] as const

export type PresentationErrorCode = typeof PRESENTATION_ERROR_CODES[number]

/** `message` is European Portuguese and safe to show. */
export type PresentationError = { code: PresentationErrorCode; message: string }

/** Mirrors the `Unexpected` message in src-tauri/src/presentation.rs. */
export const GENERIC_PRESENTATION_ERROR_MESSAGE = 'Ocorreu um erro inesperado na apresentação.'

export type PresentationController = {
  /** Opens the TV window, or shows and focuses it; a closed window is replaced. */
  open(): Promise<void>
  publish(state: PresentationState): Promise<void>
  /** Completes the running reveal at once. */
  skip(): Promise<void>
  setMuted(muted: boolean): Promise<void>
}

/** The operator's controller: `publish` also takes a tournament state and its event, as the session sends them. */
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

export function createTauriPresentationController(invokeFn: InvokeFn = invoke): TauriPresentation {
  function publish(state: PresentationState): Promise<void>
  function publish(state: TournamentState, event: SessionEvent): Promise<void>
  async function publish(state: PresentationState | TournamentState, event?: SessionEvent) {
    const projected = event ? projectPresentation(state as TournamentState, event) : state as PresentationState
    await call<void>(invokeFn, 'publish_presentation_state', { state: projected })
  }

  return {
    open: () => call<void>(invokeFn, 'open_presentation_window'),
    publish,
    skip: () => call<void>(invokeFn, 'skip_presentation'),
    setMuted: muted => call<void>(invokeFn, 'set_presentation_muted', { muted }),
  }
}

/** The last published state and sound setting, read by the presentation window on mount. */
export const fetchPresentationSnapshot = (invokeFn: InvokeFn = invoke) =>
  call<PresentationSnapshot>(invokeFn, 'get_presentation_state')

/** Sets the sound from the TV window itself, so a reopened window keeps it. */
export const storePresentationMuted = (muted: boolean, invokeFn: InvokeFn = invoke) =>
  call<void>(invokeFn, 'set_presentation_muted', { muted })
