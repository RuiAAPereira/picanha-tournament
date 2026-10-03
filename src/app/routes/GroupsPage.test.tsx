import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawGroups, proposeFormats, type ReadyProposal } from '../../domain/formats'
import { applyMatchResult, createTournamentState, type TournamentState } from '../../domain/tournament'
import { NOW, fakeRepository, fourPlayerState, playGroups, renderOperator, snapshotOf } from '../testSupport'

afterEach(() => {
  window.location.hash = ''
})

async function openGroups(state: TournamentState) {
  const repository = fakeRepository(snapshotOf(state))
  const rendered = renderOperator('#/operator/groups', { repository })
  await screen.findByRole('heading', { name: 'Grupo A' })
  return rendered
}

/** Ana, Bruno and Carla beat each other in a cycle and all beat Duarte by the same margin. */
function threeWayTie(): TournamentState {
  const beats: Record<string, string> = { ana: 'bruno', bruno: 'carla', carla: 'ana' }
  const state = fourPlayerState()
  return state.groups[0].matches.reduce((current, { id, player1Id, player2Id }) => applyMatchResult(current, {
    matchId: id,
    winnerId: player2Id === 'duarte' || beats[player1Id] === player2Id ? player1Id : player2Id,
    loserBallsRemaining: 1,
    at: NOW,
  }), state)
}

describe('GroupsPage', () => {
  it('shows standings and records a result through the dialog', async () => {
    const { user, repository } = await openGroups(fourPlayerState())
    const table = screen.getByRole('table', { name: 'Classificação do Grupo A' })
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    // Everyone is level before a match is played; that is not yet a tie to draw.
    expect(screen.queryByText('Empate por sortear')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Registar resultado: Bruno contra Ana' }))
    const dialog = screen.getByRole('dialog', { name: 'Registar resultado' })
    await user.click(within(dialog).getByRole('radio', { name: 'Ana' }))
    await user.type(within(dialog).getByLabelText(/bolas deixadas/i), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar resultado' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The button that opened the dialog is gone, so focus lands on the page heading, not on body.
    expect(screen.getByRole('heading', { name: 'Grupos' })).toHaveFocus()
    const played = screen.getByRole('region', { name: 'Jogos concluídos' })
    expect(within(played).getByText(/Ana venceu; Bruno deixou 2 bolas/)).toBeVisible()
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    expect(repository.save.mock.calls[0][0].state.auditLog).toMatchObject(
      [{ type: 'result', at: NOW, matchId: 'group-A-1-4', result: { winnerId: 'ana', loserBallsRemaining: 2 } }])
  })

  it('asks before a correction that undoes the final, and does nothing on cancel', async () => {
    const { user, repository } = await openGroups(playGroups(fourPlayerState(), ['ana', 'bruno', 'carla', 'duarte']))
    const correct = async () => {
      await user.click(screen.getByRole('button', { name: 'Corrigir: Bruno contra Ana' }))
      const dialog = screen.getByRole('dialog', { name: 'Corrigir resultado' })
      await user.click(within(dialog).getByRole('radio', { name: 'Bruno' }))
      await user.click(within(dialog).getByRole('button', { name: 'Confirmar resultado' }))
      return screen.getByRole('dialog', { name: 'Esta correção anula jogos já definidos' })
    }

    const confirm = await correct()
    expect(within(confirm).getByRole('listitem')).toHaveTextContent('Final: Ana contra Bruno')
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/Ana venceu; Bruno deixou 1 bola$/)).toBeVisible()
    expect(repository.save).not.toHaveBeenCalled()

    await user.click(within(await correct()).getByRole('button', { name: 'Confirmar correção' }))
    expect(screen.getByText(/Bruno venceu; Ana deixou 1 bola$/)).toBeVisible()
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    expect(repository.save.mock.calls[0][0].state.auditLog.at(-1))
      .toMatchObject({ type: 'correction', invalidatedMatchIds: ['knockout-1-1'] })
  })

  it('applies a correction that changes no later match directly', async () => {
    const { user, repository } = await openGroups(playGroups(fourPlayerState(), ['ana', 'bruno', 'carla', 'duarte']))
    await user.click(screen.getByRole('button', { name: 'Corrigir: Carla contra Duarte' }))
    const balls = screen.getByLabelText(/bolas deixadas/i)
    await user.clear(balls)
    await user.type(balls, '5')
    await user.click(screen.getByRole('button', { name: 'Confirmar resultado' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/Carla venceu; Duarte deixou 5 bolas/)).toBeVisible()
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
  })

  it('draws a pending tie and saves it', async () => {
    const { user, repository } = await openGroups(threeWayTie())
    expect(screen.getAllByText('Empate por sortear')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Sortear desempate do Grupo A' }))
    expect(screen.queryByRole('button', { name: /sortear desempate/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Empate por sortear')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    expect(repository.save.mock.calls[0][0].state.auditLog.at(-1)).toMatchObject({ type: 'tieDraw', at: NOW })
  })

  it('lists preliminary matches first and explains groups still waiting for them', async () => {
    const proposal = proposeFormats(5).find(candidate => !candidate.creationBlocked && candidate.preliminaryRound) as ReadyProposal
    const players = ['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva'].map(name => ({ id: name.toLowerCase(), displayName: name }))
    const state = createTournamentState({
      id: 't', name: 'Torneio', players, proposal, createdAt: NOW,
      draw: drawGroups(players.map(player => player.id), proposal, () => 0),
    })
    await openGroups(state)

    const preliminary = screen.getByRole('region', { name: 'Pré-eliminatórias' })
    const [match] = state.preliminaryMatches
    const names = [match.player1Id, match.player2Id].map(id => players.find(player => player.id === id)!.displayName)
    expect(within(preliminary).getByText('Pré-eliminatória 1')).toBeVisible()
    expect(within(preliminary).getByText(`${names[0]} contra ${names[1]}`)).toBeVisible()
    const group = screen.getByRole('region', { name: 'Grupo A' })
    expect(within(group).getByText(/os jogos deste grupo são criados quando a pré-eliminatória terminar/i)).toBeVisible()
    expect(within(group).getByText('Vencedor da Pré-eliminatória 1')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver fase final' })).toHaveAttribute('href', '#/operator/bracket')
  })
})
