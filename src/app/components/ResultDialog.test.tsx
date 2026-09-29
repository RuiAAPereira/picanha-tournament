import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ResultDialog from './ResultDialog'

const players = [{ id: 'rui', displayName: 'Rui' }, { id: 'ana', displayName: 'Ana' }] as const

function renderDialog(props: Partial<Parameters<typeof ResultDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  const rendered = render(
    <ResultDialog matchId="group-A-1-2" players={[...players]} onConfirm={onConfirm} onCancel={onCancel} {...props} />)
  return { user, onConfirm, onCancel, ...rendered }
}

describe('ResultDialog', () => {
  it('confirms the winner and the balls left by the loser', async () => {
    const { user, onConfirm } = renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Rui' }))
    await user.type(screen.getByLabelText(/bolas deixadas pelo derrotado/i), '2')
    await user.click(screen.getByRole('button', { name: /confirmar resultado/i }))
    expect(onConfirm).toHaveBeenCalledWith(
      { matchId: 'group-A-1-2', winnerId: 'rui', loserBallsRemaining: 2, kind: 'played' })
  })

  it('records a withdrawal as a loss with all seven balls remaining', async () => {
    const { user, onConfirm } = renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Ana' }))
    await user.type(screen.getByLabelText(/bolas deixadas pelo derrotado/i), '3')
    await user.click(screen.getByRole('checkbox', { name: /desistência/i }))
    const balls = screen.getByLabelText(/bolas deixadas pelo derrotado/i)
    expect(balls).toHaveValue(7)
    expect(balls).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /confirmar resultado/i }))
    expect(onConfirm).toHaveBeenCalledWith(
      { matchId: 'group-A-1-2', winnerId: 'ana', loserBallsRemaining: 7, kind: 'withdrawal' })
  })

  it('is a labelled modal that takes focus and cancels on Escape', async () => {
    const { user, onCancel } = renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Registar resultado' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('keeps keyboard focus inside the dialog', async () => {
    const { user } = renderDialog()
    const dialog = screen.getByRole('dialog')
    for (let step = 0; step < 8; step++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('explains missing or invalid input without confirming', async () => {
    const { user, onConfirm } = renderDialog()
    await user.click(screen.getByRole('button', { name: /confirmar resultado/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o vencedor.')
    await user.click(screen.getByRole('radio', { name: 'Rui' }))
    await user.type(screen.getByLabelText(/bolas deixadas pelo derrotado/i), '8')
    await user.click(screen.getByRole('button', { name: /confirmar resultado/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('As bolas deixadas têm de ser um número inteiro de 0 a 7.')
    const balls = screen.getByLabelText(/bolas deixadas pelo derrotado/i)
    expect(balls).toHaveAttribute('aria-invalid', 'true')
    expect(balls).toHaveAccessibleDescription('As bolas deixadas têm de ser um número inteiro de 0 a 7.')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('makes the page behind it inert while open', () => {
    const { container, unmount } = renderDialog()
    expect(container).toHaveAttribute('inert')
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
    unmount()
    expect(container).not.toHaveAttribute('inert')
  })

  it('shows a rule error from the tournament inline and stays open', async () => {
    const onConfirm = vi.fn(() => { throw new Error('O jogo já tem resultado.') })
    const { user } = renderDialog({ onConfirm })
    await user.click(screen.getByRole('radio', { name: 'Rui' }))
    await user.type(screen.getByLabelText(/bolas deixadas pelo derrotado/i), '0')
    await user.click(screen.getByRole('button', { name: /confirmar resultado/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('O jogo já tem resultado.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens prefilled in correction mode', async () => {
    const { user, onConfirm } = renderDialog({
      mode: 'correct',
      initial: { winnerId: 'ana', loserBallsRemaining: 4, kind: 'played' },
    })
    expect(screen.getByRole('dialog', { name: 'Corrigir resultado' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Ana' })).toBeChecked()
    expect(screen.getByLabelText(/bolas deixadas pelo derrotado/i)).toHaveValue(4)
    await user.click(screen.getByRole('radio', { name: 'Rui' }))
    await user.click(screen.getByRole('button', { name: /confirmar resultado/i }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ winnerId: 'rui', loserBallsRemaining: 4 }))
  })
})
