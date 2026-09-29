import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawGroups, proposeFormats, type ReadyProposal } from '../../domain/formats'
import { createTournamentState, type TournamentState } from '../../domain/tournament'
import { NOW, fakeRepository, fourPlayerState, playGroups, renderOperator, snapshotOf } from '../testSupport'

afterEach(() => {
  window.location.hash = ''
})

async function openBracket(state: TournamentState) {
  const repository = fakeRepository(snapshotOf(state))
  const rendered = renderOperator('#/operator/bracket', { repository })
  await screen.findByRole('heading', { name: 'Fase final' })
  return rendered
}

describe('BracketPage', () => {
  it('names unresolved slots by group place and offers no result entry', async () => {
    await openBracket(fourPlayerState())
    const final = screen.getByRole('region', { name: 'Final' })
    expect(within(final).getByText('1.º Grupo A contra 2.º Grupo A')).toBeVisible()
    expect(within(final).queryByRole('button')).not.toBeInTheDocument()
  })

  it('names crossings and later rounds when best runners-up qualify', async () => {
    const proposal = proposeFormats(12)[0] as ReadyProposal
    const players = Array.from({ length: 12 }, (_, index) => ({ id: `p${index + 1}`, displayName: `P${index + 1}` }))
    await openBracket(createTournamentState({
      id: 't', name: 'Torneio', players, proposal, createdAt: NOW,
      draw: drawGroups(players.map(player => player.id), proposal, () => 0),
    }))
    const semis = screen.getByRole('region', { name: 'Meias-finais' })
    expect(within(semis).getAllByText('1.º de grupo contra Melhor 2.º ou 1.º de grupo')).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Final' }))
      .getByText('Vencedor do jogo 1 (Meias-finais) contra Vencedor do jogo 2 (Meias-finais)')).toBeVisible()
  })

  it('records the final and shows the champion', async () => {
    const { user, repository } = await openBracket(playGroups(fourPlayerState(), ['ana', 'bruno', 'carla', 'duarte']))
    await user.click(screen.getByRole('button', { name: 'Registar resultado: Ana contra Bruno' }))
    await user.click(screen.getByRole('radio', { name: 'Ana' }))
    await user.click(screen.getByRole('checkbox', { name: /desistência/i }))
    await user.click(screen.getByRole('button', { name: 'Confirmar resultado' }))

    expect(screen.getByText('Campeão: Ana')).toBeVisible()
    expect(screen.getByText('Ana venceu por desistência de Bruno')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Corrigir: Ana contra Bruno' })).toBeEnabled()
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
    expect(repository.save.mock.calls[0][0]).toMatchObject({ status: 'finished' })
  })
})
