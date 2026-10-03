import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyMatchResult } from '../../domain/tournament'
import { NOW, fakeRepository, fourPlayerState, playGroups, renderOperator, snapshotOf } from '../testSupport'

afterEach(() => {
  window.location.hash = ''
})

async function openHome(state = fourPlayerState()) {
  const repository = fakeRepository(snapshotOf(state))
  const rendered = renderOperator('#/operator', { repository, demo: fourPlayerState })
  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Continuar torneio' })).toBeEnabled())
  return rendered
}

describe('HomePage', () => {
  it('asks before a new tournament replaces an unfinished one', async () => {
    const { user } = await openHome()
    expect(screen.getByText(/Torneio em curso:/)).toHaveTextContent('Torneio em curso: Torneio')
    await user.click(screen.getByRole('button', { name: 'Novo torneio' }))
    const dialog = screen.getByRole('dialog', { name: 'Substituir o torneio em curso?' })
    expect(dialog).toHaveTextContent('Torneio')
    expect(dialog).toHaveTextContent('não pode voltar a ser aberto na aplicação')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/operator')

    await user.click(screen.getByRole('button', { name: 'Novo torneio' }))
    await user.click(screen.getByRole('button', { name: 'Criar novo torneio' }))
    expect(await screen.findByRole('heading', { name: 'Novo torneio' })).toBeVisible()
  })

  it('asks before the demonstration replaces an unfinished tournament', async () => {
    const { user, repository } = await openHome()
    await user.click(screen.getByRole('button', { name: 'Carregar demonstração' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(repository.save).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Carregar demonstração' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Carregar demonstração' }))
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1))
  })

  it('does not ask when the current tournament is finished', async () => {
    const played = playGroups(fourPlayerState(), ['ana', 'bruno', 'carla', 'duarte'])
    const finished = applyMatchResult(played, { matchId: 'knockout-1-1', winnerId: 'ana', loserBallsRemaining: 0, at: NOW })
    const { user } = await openHome(finished)
    expect(screen.getByText(/Último torneio:/)).toHaveTextContent('Último torneio: Torneio (terminado)')
    expect(screen.queryByText(/Torneio em curso/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Novo torneio' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Novo torneio' })).toBeVisible()
  })
})
