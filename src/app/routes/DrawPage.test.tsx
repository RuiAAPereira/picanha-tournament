import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeRepository, fourPlayerState, renderOperator, snapshotOf } from '../testSupport'

afterEach(() => {
  window.location.hash = ''
})

describe('DrawPage', () => {
  it('briefs the operator before drawing and presents the saved group roster afterwards', async () => {
    const { user, repository } = renderOperator('#/operator/new')
    await screen.findByRole('heading', { name: 'Novo torneio' })
    await user.type(screen.getByLabelText('Nome do torneio'), 'Taça da Arena')
    for (const player of ['Ana', 'Bruno', 'Carla', 'Duarte']) {
      await user.type(screen.getByLabelText('Jogador'), `${player}{Enter}`)
    }
    await user.click(screen.getByRole('button', { name: 'Criar e sortear' }))
    const briefing = await screen.findByRole('region', { name: 'Preparar sorteio' })
    expect(briefing).toHaveTextContent('Taça da Arena')
    expect(briefing).toHaveTextContent('4 jogadores')
    expect(within(briefing).getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '#/operator/new')
    expect(repository.save).not.toHaveBeenCalled()
    await user.click(within(briefing).getByRole('button', { name: 'Sortear' }))
    const rosters = await screen.findByRole('region', { name: 'Grupos sorteados' })
    const group = within(rosters).getByRole('region', { name: 'Grupo A' })
    expect(within(group).getAllByRole('listitem')).toHaveLength(4)
    for (const player of ['Ana', 'Bruno', 'Carla', 'Duarte']) expect(group).toHaveTextContent(player)
    expect(screen.queryByRole('button', { name: 'Sortear' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continuar para os grupos' })).toHaveAttribute('href', '#/operator/groups')
  })

  it('shows the roster when reopening a saved draw', async () => {
    renderOperator('#/operator/draw', { repository: fakeRepository(snapshotOf(fourPlayerState())) })
    const rosters = await screen.findByRole('region', { name: 'Grupos sorteados' })
    expect(within(rosters).getByRole('region', { name: 'Grupo A' })).toHaveTextContent('Ana')
  })
})
