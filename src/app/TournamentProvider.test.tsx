import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NOW, deferred, fakeRepository, fourPlayerState, playGroups, renderOperator, renderSession, snapshotOf,
} from './testSupport'

afterEach(() => {
  window.location.hash = ''
})

const storageError = (code: string) => ({ code, message: 'Mensagem do armazenamento.' })

async function createAndDraw(user: ReturnType<typeof renderOperator>['user']) {
  await screen.findByRole('heading', { name: 'Novo torneio' })
  await user.type(screen.getByLabelText('Nome do torneio'), 'Torneio da Picanha')
  for (const name of ['Ana', 'Bruno', 'Carla', 'Duarte']) await user.type(screen.getByLabelText('Jogador'), `${name}{Enter}`)
  await user.click(screen.getByRole('button', { name: 'Criar e sortear' }))
  await user.click(await screen.findByRole('button', { name: 'Sortear' }))
}

describe('startup', () => {
  it('offers to continue the saved tournament', async () => {
    const repository = fakeRepository(snapshotOf(fourPlayerState()))
    const { user } = renderOperator('#/operator', { repository })
    const resume = await screen.findByRole('button', { name: 'Continuar torneio' })
    await vi.waitFor(() => expect(resume).toBeEnabled())
    await user.click(resume)
    expect(await screen.findByRole('heading', { name: 'Grupo A' })).toBeVisible()
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('starts without a tournament when nothing is saved', async () => {
    renderOperator('#/operator')
    expect(await screen.findByRole('button', { name: 'Novo torneio' })).toBeEnabled()
    await vi.waitFor(() => expect(screen.queryByText(/a carregar/i)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Continuar torneio' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Carregar demonstração' })).not.toBeInTheDocument()
  })

  it('never waits for the tournament list before finishing startup', async () => {
    const repository = fakeRepository(snapshotOf(fourPlayerState()))
    repository.list.mockImplementation(() => new Promise(() => {}))
    renderOperator('#/operator', { repository })
    const resume = await screen.findByRole('button', { name: 'Continuar torneio' })
    await vi.waitFor(() => expect(resume).toBeEnabled())
    expect(screen.queryByText(/a carregar/i)).not.toBeInTheDocument()
  })

  it('warns, without failing, when the data folder cannot be written', async () => {
    const repository = fakeRepository()
    repository.loadCurrent.mockRejectedValue(storageError('unwritable'))
    renderOperator('#/operator', { repository })
    expect(await screen.findByText(/a pasta de dados não permite escrita/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Novo torneio' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Continuar torneio' })).toBeDisabled()
  })

  it('reports saved data from a newer version and still allows a new tournament', async () => {
    const repository = fakeRepository()
    repository.loadCurrent.mockRejectedValue(storageError('schema_newer'))
    renderOperator('#/operator', { repository })
    expect(await screen.findByRole('alert')).toHaveTextContent(/versão mais recente/)
    expect(screen.getByRole('button', { name: 'Novo torneio' })).toBeEnabled()
  })

  it('reports a saved tournament with an invalid state as damaged and still allows a new one', async () => {
    const repository = fakeRepository()
    const snapshot = snapshotOf(fourPlayerState())
    repository.loadCurrent.mockResolvedValue({ ...snapshot, state: { id: 't', name: 'T' } as never })
    renderOperator('#/operator', { repository })
    expect(await screen.findByRole('alert')).toHaveTextContent(/danificado/)
    expect(screen.getByRole('button', { name: 'Novo torneio' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Continuar torneio' })).toBeDisabled()
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('loads the demonstration only when one is provided, as a new tournament each time', async () => {
    const repository = fakeRepository()
    const { user } = renderOperator('#/operator', { repository, demo: fourPlayerState })
    await user.click(await screen.findByRole('button', { name: 'Carregar demonstração' }))
    expect(await screen.findByRole('heading', { name: 'Grupo A' })).toBeVisible()
    // A fresh id keeps a reloaded demo from rewriting the saved history of an earlier one.
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    expect(repository.save.mock.calls[0][0]).toMatchObject({ tournamentId: 'torneio-20260928-201530' })
    expect(repository.save.mock.calls[0][0].state.id).toBe('torneio-20260928-201530')
  })
})

describe('draw and autosave', () => {
  it('draws, saves the snapshot and shows the groups before continuing', async () => {
    const repository = fakeRepository()
    const { user } = renderOperator('#/operator/new', { repository })
    await createAndDraw(user)

    const group = await screen.findByRole('region', { name: 'Grupo A' })
    expect(within(group).getAllByRole('listitem')).toHaveLength(4)
    expect(repository.save).toHaveBeenCalledTimes(1)
    const [snapshot] = repository.save.mock.calls[0]
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      tournamentId: 'torneio-da-picanha-20260928-201530',
      name: 'Torneio da Picanha',
      savedAt: NOW,
      status: 'in_progress',
    })
    expect(snapshot.state.createdAt).toBe(NOW)
    expect(snapshot.state.players.map(player => player.id)).toEqual(['ana', 'bruno', 'carla', 'duarte'])

    await user.click(screen.getByRole('link', { name: 'Continuar para os grupos' }))
    expect(await screen.findByRole('heading', { name: 'Jogos por disputar' })).toBeVisible()
  })

  it('keeps the drawn tournament when saving fails and saves it again on retry', async () => {
    const repository = fakeRepository()
    repository.save.mockRejectedValueOnce(storageError('unwritable'))
    const { user } = renderOperator('#/operator/new', { repository })
    await createAndDraw(user)

    expect(await screen.findByText(/não foi possível guardar/i)).toBeVisible()
    expect(screen.getByRole('region', { name: 'Grupo A' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2))
    expect(repository.save.mock.calls[1][0].state).toEqual(repository.save.mock.calls[0][0].state)
    await vi.waitFor(() => expect(screen.queryByText(/não foi possível guardar/i)).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Guardado')
  })

  it('marks the snapshot finished once the final has a result', async () => {
    const repository = fakeRepository()
    const session = renderSession(repository, playGroups(fourPlayerState(), ['ana', 'bruno', 'carla', 'duarte']))
    await vi.waitFor(() => expect(session.current?.state).not.toBeNull())
    act(() => session.current!.recordResult({ matchId: 'knockout-1-1', winnerId: 'ana', loserBallsRemaining: 0, kind: 'played' }))
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    expect(repository.save.mock.calls[0][0].status).toBe('finished')
  })

  it('never saves twice at once and saves the latest state after the running save', async () => {
    const repository = fakeRepository()
    const first = deferred()
    repository.save.mockImplementationOnce(() => first.promise)
    const session = renderSession(repository, fourPlayerState())
    await vi.waitFor(() => expect(session.current?.state).not.toBeNull())
    const [m1, m2, m3] = session.current!.state!.groups[0].matches
    for (const match of [m1, m2, m3]) {
      act(() => session.current!.recordResult(
        { matchId: match.id, winnerId: match.player1Id, loserBallsRemaining: 0, kind: 'played' }))
    }
    expect(repository.save).toHaveBeenCalledTimes(1)
    await act(async () => first.resolve())
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2))
    expect(repository.save.mock.calls[1][0].state.auditLog).toHaveLength(3)
  })

  it('throws rule errors to the caller without changing or saving the tournament', async () => {
    const repository = fakeRepository()
    const session = renderSession(repository, fourPlayerState())
    await vi.waitFor(() => expect(session.current?.state).not.toBeNull())
    const before = session.current!.state
    expect(() => session.current!.recordResult(
      { matchId: 'knockout-1-1', winnerId: 'ana', loserBallsRemaining: 0, kind: 'played' })).toThrow(/dois jogadores/)
    expect(session.current!.state).toBe(before)
    expect(repository.save).not.toHaveBeenCalled()
  })
})

describe('presentation and export', () => {
  it('keeps operating with a warning when the presentation cannot open', async () => {
    const { user } = renderOperator('#/operator', { repository: fakeRepository(snapshotOf(fourPlayerState())) })
    await user.click(await screen.findByRole('button', { name: 'Apresentar' }))
    expect(await screen.findByText('A apresentação ainda não está disponível.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Novo torneio' })).toBeEnabled()
  })

  it('calls the injected presentation', async () => {
    const presentation = { open: vi.fn(async () => {}) }
    const { user } = renderOperator('#/operator', { presentation })
    await user.click(await screen.findByRole('button', { name: 'Apresentar' }))
    expect(presentation.open).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/apresentação/i, { ignore: 'label, button, script, style' })).not.toBeInTheDocument()
  })

  it('exports a backup with a safe, dated file name', async () => {
    const repository = fakeRepository(snapshotOf({ ...fourPlayerState(), name: 'Taça São João!' }))
    const { user } = renderOperator('#/operator/groups', { repository })
    await user.click(await screen.findByRole('button', { name: 'Exportar cópia de segurança' }))
    expect(repository.exportBackup).toHaveBeenCalledWith('torneio-20260928-200000', 'taca-sao-joao-20260928-201530.sqlite')
    expect(await screen.findByText(/taca-sao-joao-20260928-201530\.sqlite/)).toBeVisible()
  })

  it('explains a failed export in Portuguese', async () => {
    const repository = fakeRepository(snapshotOf(fourPlayerState()))
    repository.exportBackup.mockRejectedValue(storageError('invalid_destination'))
    const { user } = renderOperator('#/operator/groups', { repository })
    await user.click(await screen.findByRole('button', { name: 'Exportar cópia de segurança' }))
    expect(await screen.findByText(/não foi possível exportar a cópia de segurança/i)).toBeVisible()
  })
})
