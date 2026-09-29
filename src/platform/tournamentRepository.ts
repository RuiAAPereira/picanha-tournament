import { invoke } from '@tauri-apps/api/core'
import type { TournamentState } from '../domain/tournament'

export type TournamentStatus = 'in_progress' | 'finished'

/** Mirrors the Rust `TournamentSnapshot`; `state` is stored as opaque JSON. */
export type TournamentSnapshot = {
  schemaVersion: number
  tournamentId: string
  name: string
  savedAt: string
  status: TournamentStatus
  state: TournamentState
}

export type TournamentSummary = {
  tournamentId: string
  name: string
  savedAt: string
  status: TournamentStatus
}

/** Mirrors `StorageErrorCode` in src-tauri/src/storage/models.rs. */
export const STORAGE_ERROR_CODES = [
  'unwritable',
  'busy',
  'corrupt',
  'not_found',
  'schema_newer',
  'history_conflict',
  'invalid_snapshot',
  'invalid_destination',
  'unexpected',
] as const

export type StorageErrorCode = typeof STORAGE_ERROR_CODES[number]

/** `message` is European Portuguese and safe to show; it never contains paths. */
export type StorageError = { code: StorageErrorCode; message: string }

/** Mirrors `SNAPSHOT_SCHEMA_VERSION` in src-tauri/src/storage/models.rs. */
export const TOURNAMENT_SNAPSHOT_SCHEMA_VERSION = 1

/** Mirrors the `Unexpected` message in src-tauri/src/storage/models.rs. */
export const GENERIC_STORAGE_ERROR_MESSAGE = 'Ocorreu um erro inesperado ao aceder aos dados guardados.'

export type TournamentRepository = {
  loadCurrent(): Promise<TournamentSnapshot | null>
  save(snapshot: TournamentSnapshot): Promise<void>
  list(): Promise<TournamentSummary[]>
  /** `destination` resolves inside `<exe>/data/backups`; a bare file name is the normal case. */
  exportBackup(tournamentId: string, destination: string): Promise<void>
}

export type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>

const isStorageErrorCode = (value: unknown): value is StorageErrorCode =>
  (STORAGE_ERROR_CODES as readonly unknown[]).includes(value)

const isStorageError = (value: unknown): value is StorageError =>
  typeof value === 'object' && value !== null
  && isStorageErrorCode((value as { code?: unknown }).code)
  && typeof (value as { message?: unknown }).message === 'string'

const toStorageError = (error: unknown): StorageError => {
  if (isStorageError(error)) return { code: error.code, message: error.message }
  console.error('[storage]', error)
  return { code: 'unexpected', message: GENERIC_STORAGE_ERROR_MESSAGE }
}

export const createTauriTournamentRepository = (invokeFn: InvokeFn = invoke): TournamentRepository => {
  const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    try {
      return (await (args === undefined ? invokeFn(command) : invokeFn(command, args))) as T
    } catch (error) {
      throw toStorageError(error)
    }
  }

  return {
    loadCurrent: async () => (await call<TournamentSnapshot | null>('load_current_tournament')) ?? null,
    save: async (snapshot) => {
      await call<void>('save_tournament', { snapshot })
    },
    list: () => call<TournamentSummary[]>('list_tournaments'),
    exportBackup: async (tournamentId, destination) => {
      await call<void>('export_backup', { tournamentId, destination })
    },
  }
}
