import { useState } from 'react'
import type { TournamentState } from '../domain/tournament'
import {
  TOURNAMENT_SNAPSHOT_SCHEMA_VERSION, type TournamentRepository, type TournamentSnapshot,
} from '../platform/tournamentRepository'
import { championId } from './labels'
import { storageErrorMessage } from './storageMessages'
import type { SaveStatus } from './useTournamentSession'

type AutosaveDeps = { readonly current: { repository: TournamentRepository; now: () => string } }

export type Autosave = {
  saveStatus: SaveStatus
  storageError: string | null
  storageAvailable: boolean
  /** Queues `state`; resolves once the queue is empty (whether or not the last save worked). */
  persist(state: TournamentState): Promise<void>
  whenIdle(): Promise<void>
  lastSaveFailed(): boolean
  markUnavailable(message: string): void
}

/**
 * Saves one snapshot at a time. Whatever is queued meanwhile is saved next and only the latest state
 * counts; a failure keeps the state in memory and is reported until a later save works.
 */
export function useAutosave(deps: AutosaveDeps): Autosave {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [storageError, setStorageError] = useState<string | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)

  const [actions] = useState(() => {
    let queued: TournamentState | null = null
    let saving = false
    let failed = false
    let idle: Promise<void> = Promise.resolve()

    const snapshotOf = (state: TournamentState): TournamentSnapshot => ({
      schemaVersion: TOURNAMENT_SNAPSHOT_SCHEMA_VERSION,
      tournamentId: state.id,
      name: state.name,
      savedAt: deps.current.now(),
      status: championId(state) ? 'finished' : 'in_progress',
      state,
    })

    async function drain() {
      setSaveStatus('saving')
      let failure: { error: unknown } | null = null
      while (queued) {
        const next = queued
        queued = null
        try {
          await deps.current.repository.save(snapshotOf(next))
          failure = null
        } catch (error) {
          failure = { error }
        }
      }
      saving = false
      failed = !!failure
      if (failure) {
        setStorageError(storageErrorMessage('save', failure.error))
        setSaveStatus('error')
      } else {
        setStorageError(null)
        setStorageAvailable(true)
        setSaveStatus('saved')
      }
    }

    return {
      persist(state: TournamentState) {
        queued = state
        if (!saving) {
          saving = true
          idle = drain()
        }
        return idle
      },
      whenIdle: () => idle,
      lastSaveFailed: () => failed,
      markUnavailable(message: string) {
        setStorageAvailable(false)
        setStorageError(message)
      },
    }
  })

  return { saveStatus, storageError, storageAvailable, ...actions }
}
