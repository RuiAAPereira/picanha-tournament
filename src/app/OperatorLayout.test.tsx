import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeRepository, fourPlayerState, renderOperator, snapshotOf } from './testSupport'

afterEach(() => {
  window.location.hash = ''
})

describe('OperatorLayout', () => {
  it('keeps session navigation, save feedback and utility actions in the tournament landmark', async () => {
    const { user } = renderOperator('#/operator', {
      repository: fakeRepository(snapshotOf(fourPlayerState())),
    })
    const main = screen.getByRole('main', { name: 'Torneio' })
    const navigation = within(main).getByRole('navigation', { name: 'Secções' })
    expect(within(navigation).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '#/operator')
    expect(await within(navigation).findByRole('link', { name: 'Grupos' })).toHaveAttribute('href', '#/operator/groups')
    expect(within(navigation).getByRole('link', { name: 'Fase final' })).toHaveAttribute('href', '#/operator/bracket')
    expect(within(main).getByRole('status', { name: 'Estado de gravação' })).toHaveTextContent('Guardado')
    expect(within(main).getByRole('button', { name: 'Apresentar' })).toBeVisible()
    expect(within(main).getByRole('combobox', { name: 'Ecrã da apresentação' })).toBeVisible()
    expect(within(main).getByRole('button', { name: 'Exportar cópia de segurança' })).toBeVisible()
    expect(within(navigation).getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(navigation).getByRole('link', { name: 'Grupos' }))
    expect(await screen.findByRole('heading', { name: 'Jogos por disputar' })).toBeVisible()
    expect(within(navigation).getByRole('link', { name: 'Grupos' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current')
  })

  it('keeps the retry action inside the storage alert and restores saved feedback', async () => {
    const repository = fakeRepository()
    repository.save.mockRejectedValueOnce({ code: 'unwritable', message: 'Sem escrita.' })
    const { user } = renderOperator('#/operator', { repository, demo: fourPlayerState })
    await user.click(await screen.findByRole('button', { name: 'Carregar demonstração' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/não foi possível guardar/i)
    expect(alert).toHaveTextContent('As alterações continuam nesta sessão.')
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Guardado')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
