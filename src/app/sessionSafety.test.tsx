import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TournamentSnapshot } from '../platform/tournamentRepository'
import {
  deferred, fakeRepository, fourPlayerState, renderOperator, renderSession, snapshotOf, type FakeRepository,
} from './testSupport'
import type { ResultEntry, TournamentSession } from './useTournamentSession'

afterEach(() => {
  window.location.hash = ''
})

const unwritable = { code: 'unwritable', message: 'Sem escrita.' }

/** Rejects a save whose audit log is shorter than the one stored for the same id, like the Rust store. */
function historyCheckingRepository(): FakeRepository {
  const repository = fakeRepository()
  const stored = new Map<string, number>()
  repository.save.mockImplementation(async (snapshot: TournamentSnapshot) => {
    const length = snapshot.state.auditLog.length
    if ((stored.get(snapshot.tournamentId) ?? 0) > length) throw { code: 'history_conflict', message: 'Conflito.' }
    stored.set(snapshot.tournamentId, length)
  })
  return repository
}

async function ready(session: { current: TournamentSession | null }) {
  await vi.waitFor(() => expect(session.current?.loading).toBe(false))
  return session.current!
}

const firstResult = (session: TournamentSession): ResultEntry => {
  const match = session.state!.groups[0].matches.find(candidate => !candidate.result)!
  return { matchId: match.id, winnerId: match.player1Id, loserBallsRemaining: 0, kind: 'played' }
}

describe('startup load race', () => {
  it('keeps what the operator did while the saved tournament was still loading', async () => {
    const repository = fakeRepository()
    const load = deferred<TournamentSnapshot | null>()
    repository.loadCurrent.mockImplementation(() => load.promise)
    const session = renderSession(repository, null, { demo: fourPlayerState })
    expect(session.current!.loading).toBe(true)

    act(() => session.current!.loadDemo())
    await act(async () => load.resolve(snapshotOf({ ...fourPlayerState(), id: 'antigo', name: 'Antigo' })))

    expect(session.current!.loading).toBe(false)
    expect(session.current!.state!.name).toBe('Torneio')
  })

  it('disables starting a tournament until loading ends', async () => {
    const repository = fakeRepository()
    const load = deferred<TournamentSnapshot | null>()
    repository.loadCurrent.mockImplementation(() => load.promise)
    renderOperator('#/operator', { repository, demo: fourPlayerState })
    expect(screen.getByRole('button', { name: 'Novo torneio' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Carregar demonstração' })).toBeDisabled()
    await act(async () => load.resolve(null))
    expect(screen.getByRole('button', { name: 'Novo torneio' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Carregar demonstração' })).toBeEnabled()
  })
})

describe('tournament ids', () => {
  it('gives a reloaded demo a new id so both histories save', async () => {
    const repository = historyCheckingRepository()
    const session = renderSession(repository, null, { demo: fourPlayerState })
    await ready(session)

    act(() => session.current!.loadDemo())
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    act(() => session.current!.recordResult(firstResult(session.current!)))
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2))
    act(() => session.current!.loadDemo())
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(3))

    await vi.waitFor(() => expect(session.current!.saveStatus).toBe('saved'))
    const ids = repository.save.mock.calls.map(([snapshot]) => snapshot.tournamentId)
    expect(ids).toEqual(['torneio-20260928-201530', 'torneio-20260928-201530', 'torneio-20260928-201530-2'])
  })

  it('avoids ids already stored', async () => {
    const repository = fakeRepository()
    repository.list.mockResolvedValue([
      { tournamentId: 'torneio-20260928-201530', name: 'Torneio', savedAt: 'x', status: 'finished' },
      { tournamentId: 'torneio-20260928-201530-2', name: 'Torneio', savedAt: 'x', status: 'finished' },
    ] as never)
    const session = renderSession(repository, null, { demo: fourPlayerState })
    await ready(session)
    await act(async () => {})
    act(() => session.current!.loadDemo())
    expect(session.current!.state!.id).toBe('torneio-20260928-201530-3')
  })
})

describe('export and saving', () => {
  it('waits for a running save before exporting', async () => {
    const repository = fakeRepository()
    const saving = deferred()
    repository.save.mockImplementationOnce(() => saving.promise)
    const session = renderSession(repository, fourPlayerState())
    await ready(session)
    act(() => session.current!.recordResult(firstResult(session.current!)))

    let exported: Promise<void> = Promise.resolve()
    act(() => {
      exported = session.current!.exportBackup()
    })
    await act(async () => {})
    expect(repository.exportBackup).not.toHaveBeenCalled()
    await act(async () => {
      saving.resolve()
      await exported
    })
    expect(repository.exportBackup).toHaveBeenCalledTimes(1)
    expect(session.current!.notice).toMatchObject({ tone: 'info' })
  })

  it('retries a failed save before exporting and says when the copy misses the latest changes', async () => {
    const repository = fakeRepository()
    repository.save.mockRejectedValue(unwritable)
    const session = renderSession(repository, fourPlayerState())
    await ready(session)
    act(() => session.current!.recordResult(firstResult(session.current!)))
    await vi.waitFor(() => expect(session.current!.saveStatus).toBe('error'))

    await act(() => session.current!.exportBackup())

    expect(repository.save).toHaveBeenCalledTimes(2)
    expect(repository.exportBackup).toHaveBeenCalledTimes(1)
    expect(session.current!.notice).toMatchObject({ tone: 'warning', text: expect.stringMatching(/não inclui as últimas alterações/) })
  })

  it('exports normally once the retried save succeeds', async () => {
    const repository = fakeRepository()
    repository.save.mockRejectedValueOnce(unwritable)
    const session = renderSession(repository, fourPlayerState())
    await ready(session)
    act(() => session.current!.recordResult(firstResult(session.current!)))
    await vi.waitFor(() => expect(session.current!.saveStatus).toBe('error'))

    await act(() => session.current!.exportBackup())

    expect(session.current!.saveStatus).toBe('saved')
    expect(session.current!.notice).toMatchObject({ tone: 'info', text: expect.stringMatching(/exportada/) })
  })
})

describe('presentation updates', () => {
  it('publishes every confirmed change with its event', async () => {
    const presentation = { open: vi.fn(async () => {}), publish: vi.fn(async () => {}) }
    const session = renderSession(fakeRepository(), fourPlayerState(), { presentation, demo: fourPlayerState })
    await ready(session)
    const entry = firstResult(session.current!)
    act(() => session.current!.recordResult(entry))
    expect(presentation.publish).toHaveBeenLastCalledWith(session.current!.state, { type: 'result', matchId: entry.matchId })
    act(() => session.current!.loadDemo())
    expect(presentation.publish).toHaveBeenLastCalledWith(session.current!.state, { type: 'demo' })
  })

  it('warns without blocking when the presentation cannot take an update', async () => {
    const presentation = { open: vi.fn(async () => {}), publish: vi.fn(() => Promise.reject(new Error('fechada'))) }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const repository = fakeRepository()
    const session = renderSession(repository, fourPlayerState(), { presentation })
    await ready(session)
    await act(() => session.current!.openPresentation())
    act(() => session.current!.recordResult(firstResult(session.current!)))
    expect(session.current!.state!.auditLog).toHaveLength(1)
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(session.current!.notice).toMatchObject({ tone: 'warning' }))
    expect(session.current!.notice!.text).toBe('A apresentação não recebeu a última atualização. O torneio continua.')
    expect(log).toHaveBeenCalledWith('[presentation]', expect.any(Error))
    log.mockRestore()
  })

  it('keeps session actions stable across state changes', async () => {
    const session = renderSession(fakeRepository(), fourPlayerState())
    const loaded = await ready(session)
    act(() => loaded.recordResult(firstResult(loaded)))
    expect(session.current!.state).not.toBe(loaded.state)
    expect(session.current!.recordResult).toBe(loaded.recordResult)
    expect(session.current!.exportBackup).toBe(loaded.exportBackup)
  })
})
