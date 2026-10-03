import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigate, ROUTES } from '../app/hashRoute'
import OperatorApp from '../app/OperatorApp'
import { NOW, fakeRepository } from '../app/testSupport'
import { TournamentProvider } from '../app/TournamentProvider'
import type { TournamentState } from '../domain/tournament'
import type { SessionEvent } from '../platform/presentationPort'
import type { TournamentSnapshot } from '../platform/tournamentRepository'
import { projectPresentation } from '../presentation/projection'
import { createDemoTournament, demoPresentationStates } from './seedTournament'

afterEach(() => {
  window.location.hash = ''
})

/** Remembers the last save and loads it again; rejects a shorter history for the same id, like the Rust store. */
function rememberingRepository() {
  const repository = fakeRepository()
  let stored: TournamentSnapshot | null = null
  repository.save.mockImplementation(async (snapshot: TournamentSnapshot) => {
    if (stored?.tournamentId === snapshot.tournamentId && stored.state.auditLog.length > snapshot.state.auditLog.length) {
      throw { code: 'history_conflict', message: 'Conflito.' }
    }
    stored = snapshot
  })
  repository.loadCurrent.mockImplementation(async () => stored)
  return repository
}

function fakePresentation() {
  return {
    open: vi.fn(async () => {}),
    publish: vi.fn(async (_state: TournamentState, _event: SessionEvent) => {}),
    seed: vi.fn(async (_state: TournamentState) => {}),
  }
}

function renderApp(repository: ReturnType<typeof rememberingRepository>, presentation: ReturnType<typeof fakePresentation>) {
  render(
    <TournamentProvider
      repository={repository}
      presentation={presentation}
      now={() => NOW}
      random={() => 0}
      demo={createDemoTournament}
    >
      <OperatorApp />
    </TournamentProvider>,
  )
}

async function recordResult(user: ReturnType<typeof userEvent.setup>, sides: string, winner: string, balls: string) {
  await user.click(screen.getByRole('button', { name: `Registar resultado: ${sides}` }))
  const dialog = screen.getByRole('dialog', { name: 'Registar resultado' })
  await user.click(within(dialog).getByRole('radio', { name: winner }))
  await user.type(within(dialog).getByLabelText('Bolas deixadas pelo derrotado'), balls)
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar resultado' }))
}

describe('demo tournament, end to end', () => {
  it('plays the demo to the champion, guards a correction and resumes after a restart', async () => {
    const user = userEvent.setup()
    const repository = rememberingRepository()
    const presentation = fakePresentation()
    window.location.hash = ROUTES.home
    renderApp(repository, presentation)

    await user.click(await screen.findByRole('button', { name: 'Carregar demonstração' }))
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    expect(repository.save.mock.calls[0][0].state.name).toBe('Torneio de demonstração')

    act(() => navigate(ROUTES.bracket))
    await screen.findByRole('heading', { name: 'Fase final' })

    // The pending semi-final: a result for the TV.
    await recordResult(user, 'Carla contra Marta', 'Marta', '2')
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2))
    const [afterSemi, semiEvent] = presentation.publish.mock.calls.at(-1)!
    expect(semiEvent).toEqual({ type: 'result', matchId: 'knockout-2-2' })
    expect(projectPresentation(afterSemi, semiEvent)).toMatchObject({
      kind: 'result', payload: { stage: 'Meias-finais', winner: 'Marta', loser: 'Carla' },
    })

    // Correcting a quarter-final would undo the semi-final and the final: confirm first, cancel keeps everything.
    await user.click(screen.getByRole('button', { name: 'Corrigir: Carla contra Tiago' }))
    const correction = screen.getByRole('dialog', { name: 'Corrigir resultado' })
    await user.click(within(correction).getByRole('radio', { name: 'Tiago' }))
    await user.click(within(correction).getByRole('button', { name: 'Confirmar resultado' }))
    const guard = screen.getByRole('dialog', { name: 'Esta correção anula jogos já definidos' })
    expect(within(guard).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Meias-finais, jogo 2: Carla contra Marta',
      'Final: Beatriz contra Marta',
    ])
    await user.click(within(guard).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Carla venceu; Tiago deixou 4 bolas')).toBeVisible()
    expect(screen.getByText('Marta venceu; Carla deixou 2 bolas')).toBeVisible()
    expect(repository.save).toHaveBeenCalledTimes(2)
    expect(presentation.publish.mock.calls.map(([, event]) => event.type)).not.toContain('correction')

    // The final: the champion, on the operator screen and for the TV.
    await recordResult(user, 'Beatriz contra Marta', 'Beatriz', '1')
    expect(screen.getByText('Campeão: Beatriz')).toBeVisible()
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(3))
    expect(repository.save.mock.calls[2][0]).toMatchObject({ status: 'finished' })
    const [finished, finalEvent] = presentation.publish.mock.calls.at(-1)!
    expect(projectPresentation(finished, finalEvent)).toEqual(demoPresentationStates().champion)

    // Restart: a new session over the same storage resumes the finished demo.
    cleanup()
    const restarted = fakePresentation()
    window.location.hash = ROUTES.bracket
    renderApp(repository, restarted)
    expect(await screen.findByText('Campeão: Beatriz')).toBeVisible()
    expect(screen.getByText('Marta venceu; Carla deixou 2 bolas')).toBeVisible()
    await vi.waitFor(() => expect(restarted.seed).toHaveBeenCalledWith(repository.save.mock.calls[2][0].state))
  })
})
