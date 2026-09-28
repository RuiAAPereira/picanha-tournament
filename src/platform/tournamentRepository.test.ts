import { describe, expect, it, vi } from 'vitest'
import type { TournamentState } from '../domain/tournament'
import {
  createTauriTournamentRepository,
  GENERIC_STORAGE_ERROR_MESSAGE,
  type TournamentSnapshot,
  type TournamentSummary,
} from './tournamentRepository'

const snapshot: TournamentSnapshot = {
  schemaVersion: 1,
  tournamentId: 't-1',
  name: 'Torneio da Picanha',
  savedAt: '2026-09-28T20:00:00.000Z',
  status: 'in_progress',
  state: { id: 't-1', name: 'Torneio da Picanha', auditLog: [] } as unknown as TournamentState,
}

const setup = (response: unknown = undefined) => {
  const invokeFn = vi.fn().mockResolvedValue(response)
  return { invokeFn, repository: createTauriTournamentRepository(invokeFn) }
}

describe('createTauriTournamentRepository', () => {
  it('loads the current tournament', async () => {
    const { invokeFn, repository } = setup(snapshot)

    await expect(repository.loadCurrent()).resolves.toEqual(snapshot)
    expect(invokeFn).toHaveBeenCalledWith('load_current_tournament')
  })

  it('returns null when there is no current tournament', async () => {
    const { repository } = setup(null)

    await expect(repository.loadCurrent()).resolves.toBeNull()
  })

  it('saves a snapshot', async () => {
    const { invokeFn, repository } = setup()

    await expect(repository.save(snapshot)).resolves.toBeUndefined()
    expect(invokeFn).toHaveBeenCalledWith('save_tournament', { snapshot })
  })

  it('lists tournament summaries', async () => {
    const summaries: TournamentSummary[] = [
      { tournamentId: 't-1', name: 'Torneio', savedAt: '2026-09-28T20:00:00.000Z', status: 'finished' },
    ]
    const { invokeFn, repository } = setup(summaries)

    await expect(repository.list()).resolves.toEqual(summaries)
    expect(invokeFn).toHaveBeenCalledWith('list_tournaments')
  })

  it('exports a backup with camelCase arguments', async () => {
    const { invokeFn, repository } = setup()

    await repository.exportBackup('t-1', 'C:\\Picanha\\data\\backups\\t-1.sqlite')
    expect(invokeFn).toHaveBeenCalledWith('export_backup', {
      tournamentId: 't-1',
      destination: 'C:\\Picanha\\data\\backups\\t-1.sqlite',
    })
  })

  it('passes storage errors through unchanged', async () => {
    const error = { code: 'history_conflict', message: 'O histórico do torneio não corresponde.' }
    const invokeFn = vi.fn().mockRejectedValue(error)
    const repository = createTauriTournamentRepository(invokeFn)

    await expect(repository.save(snapshot)).rejects.toEqual(error)
  })

  it.each([
    ['a string', 'IPC failure at C:\\secret\\path'],
    ['an Error', new Error('boom')],
    ['a malformed object', { code: 42, message: null }],
    ['undefined', undefined],
  ])('normalizes %s into a generic Portuguese storage error', async (_label, rejection) => {
    const invokeFn = vi.fn().mockRejectedValue(rejection)
    const repository = createTauriTournamentRepository(invokeFn)

    await expect(repository.list()).rejects.toEqual({ code: 'unexpected', message: GENERIC_STORAGE_ERROR_MESSAGE })
    expect(GENERIC_STORAGE_ERROR_MESSAGE).toMatch(/erro inesperado/)
  })
})
