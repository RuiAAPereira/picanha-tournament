import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { proposeFormats } from '../../domain/formats'
import { renderOperator } from '../testSupport'

const names = (count: number) => Array.from({ length: count }, (_, index) => `Atleta ${index + 1}`)

async function addPlayers(user: UserEvent, players: string[]) {
  for (const player of players) await user.type(screen.getByLabelText(/jogador/i), `${player}{Enter}`)
}

async function openPage() {
  const rendered = renderOperator('#/operator/new')
  await screen.findByRole('heading', { name: 'Novo torneio' })
  return rendered
}

afterEach(() => {
  window.location.hash = ''
})

describe('NewTournamentPage', () => {
  it('adds players one at a time and shows the recommended format', async () => {
    const { user } = await openPage()
    await user.type(screen.getByLabelText(/jogador/i), 'Rui')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    const enrolment = screen.getByRole('region', { name: 'Inscrições' })
    expect(within(enrolment).getByRole('list', { name: 'Inscritos' })).toHaveTextContent('Rui')
    expect(within(screen.getByRole('region', { name: 'Formato' })).getByRole('group', { name: 'Formato' })).toBeVisible()
    expect(within(screen.getByRole('list', { name: 'Inscritos' })).getByText('Rui')).toBeVisible()
    expect(screen.getByText('1 jogador')).toBeVisible()
    expect(screen.getByLabelText(/jogador/i)).toHaveValue('')
    expect(screen.getByText(/formato recomendado/i)).toBeVisible()
  })

  it('explains the preliminary round for 13 players instead of hiding an uneven group', async () => {
    const { user } = await openPage()
    await addPlayers(user, names(13))
    expect(screen.getByText('13 jogadores')).toBeVisible()
    const recommended = screen.getByRole('region', { name: /formato recomendado/i })
    expect(within(recommended).getByText(/3 grupos de 4, após 1 pré-eliminatória com 2 jogadores sorteados/))
      .toBeVisible()
    expect(within(recommended).getByText(/1 vencedor avança para os grupos/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Criar e sortear' })).toBeEnabled()
  })

  it('disables creation and explains why when the player count is not supported', async () => {
    const { user } = await openPage()
    await addPlayers(user, names(3))
    expect(screen.getByText('O torneio requer 4 a 32 jogadores.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Criar e sortear' })).toBeDisabled()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows the only format and its reason for 7 players', async () => {
    const ready = proposeFormats(7).filter(proposal => !proposal.creationBlocked)
    expect(ready).toHaveLength(1)
    const { user } = await openPage()
    await addPlayers(user, names(7))
    const recommended = screen.getByRole('region', { name: /formato recomendado/i })
    expect(within(recommended).getByText(ready[0].reason)).toBeVisible()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar e sortear' })).toBeEnabled()
  })

  it('rejects a player whose name matches an existing one', async () => {
    const { user } = await openPage()
    await addPlayers(user, ['Rui', 'rúi '])
    expect(screen.getByRole('alert')).toHaveTextContent('Já existe um jogador com esse nome.')
    expect(screen.getByText('1 jogador')).toBeVisible()
    await addPlayers(user, ['Ana'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('2 jogadores')).toBeVisible()
  })

  it('removes a player from the list', async () => {
    const { user } = await openPage()
    await addPlayers(user, ['Rui', 'Ana'])
    await user.click(screen.getByRole('button', { name: 'Remover Rui' }))
    expect(screen.queryByText('Rui')).not.toBeInTheDocument()
    expect(screen.getByText('1 jogador')).toBeVisible()
  })

  it('requires a tournament name', async () => {
    const { user, repository } = await openPage()
    await addPlayers(user, names(4))
    await user.click(screen.getByRole('button', { name: 'Criar e sortear' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indique o nome do torneio.')
    expect(screen.getByLabelText('Nome do torneio')).toHaveAttribute('aria-invalid', 'true')
    expect(window.location.hash).toBe('#/operator/new')
    expect(repository.save).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Nome do torneio'), 'T')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome do torneio')).toHaveAttribute('aria-invalid', 'false')
  })

  it('offers alternatives and goes to the draw with the chosen format, without saving yet', async () => {
    const { user, repository } = await openPage()
    await user.type(screen.getByLabelText('Nome do torneio'), 'Torneio da Picanha')
    await addPlayers(user, names(16))
    const formats = screen.getByRole('group', { name: 'Formato' })
    expect(within(formats).getByRole('radio', { name: 'Recomendado' })).toBeChecked()
    const alternative = screen.getByRole('radio', { name: 'Alternativa 1' })
    expect(alternative).toHaveAccessibleDescription(/^Alternativa \(grupos de 3 em vez de 4/)
    await user.click(alternative)
    await user.click(screen.getByRole('button', { name: 'Criar e sortear' }))
    expect(await screen.findByRole('heading', { name: 'Sorteio' })).toBeVisible()
    expect(window.location.hash).toBe('#/operator/draw')
    expect(screen.getByText(/5 grupos de 3/)).toBeVisible()
    expect(repository.save).not.toHaveBeenCalled()
  })
})
