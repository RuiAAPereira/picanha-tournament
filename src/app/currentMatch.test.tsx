import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PresentationPort } from '../platform/presentationPort'
import { fakeRepository, fourPlayerState, renderOperator, snapshotOf } from './testSupport'

afterEach(() => {
  window.location.hash = ''
})

describe('current match panel', () => {
  it('offers the next match, starts it, and moves to the following one after the result', async () => {
    const publish = vi.fn(async () => {})
    const presentation: PresentationPort = { open: async () => {}, publish }
    const state = fourPlayerState()
    const first = state.groups[0].matches[0]
    const { user } = renderOperator('#/operator/groups', { repository: fakeRepository(snapshotOf(state)), presentation })

    const panel = await screen.findByRole('region', { name: 'Próximo jogo' })
    await user.click(within(panel).getByRole('button', { name: 'Iniciar jogo' }))
    expect(publish).toHaveBeenLastCalledWith(expect.anything(), { type: 'start' })

    const live = await screen.findByRole('region', { name: 'A decorrer' })
    await user.click(within(live).getByRole('button', { name: 'Terminar e registar resultado' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getAllByRole('radio')[0])
    await user.type(within(dialog).getByLabelText(/bolas deixadas pelo derrotado/i), '2')
    await user.click(within(dialog).getByRole('button', { name: /confirmar resultado/i }))

    const next = await screen.findByRole('region', { name: 'Próximo jogo' })
    expect(next).toHaveTextContent('Grupo A')
    expect(publish).toHaveBeenLastCalledWith(expect.anything(), { type: 'result', matchId: first.id })
  })
})
