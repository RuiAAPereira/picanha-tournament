import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTauriPresentationController } from '../platform/presentation'
import { fakeRepository, fourPlayerState, renderOperator, renderSession, snapshotOf } from './testSupport'
import type { TournamentSession } from './useTournamentSession'

afterEach(() => {
  window.location.hash = ''
})

const OUT_OF_DATE = 'A apresentação não recebeu a última atualização. O torneio continua.'
const closed = { code: 'window_closed', message: 'A janela da apresentação está fechada.' }

const fakePresentation = () => ({
  open: vi.fn(async () => {}),
  publish: vi.fn(async () => {}),
  skip: vi.fn(async () => {}),
  setMuted: vi.fn(async (_muted: boolean) => {}),
})

async function ready(session: { current: TournamentSession | null }) {
  await vi.waitFor(() => expect(session.current?.loading).toBe(false))
  return session.current!
}

const firstResult = (session: TournamentSession) => {
  const match = session.state!.groups[0].matches[0]
  return { matchId: match.id, winnerId: match.player1Id, loserBallsRemaining: 2, kind: 'played' as const }
}

describe('operator presentation controls', () => {
  it('offers Saltar and mute only once the presentation is open', async () => {
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await screen.findByRole('button', { name: 'Apresentar' })
    expect(screen.queryByRole('button', { name: 'Saltar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Silenciar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apresentar' }))
    await user.click(await screen.findByRole('button', { name: 'Saltar' }))
    expect(presentation.skip).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Silenciar' }))
    expect(presentation.setMuted).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Ativar som' }))
    expect(presentation.setMuted).toHaveBeenLastCalledWith(false)
  })

  it('keeps the controls hidden when the presentation fails to open', async () => {
    const presentation = { ...fakePresentation(), open: vi.fn(() => Promise.reject(closed)) }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = renderOperator('#/operator', { presentation })
    await user.click(await screen.findByRole('button', { name: 'Apresentar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível abrir a apresentação/i)
    expect(screen.queryByRole('button', { name: 'Saltar' })).not.toBeInTheDocument()
    log.mockRestore()
  })

  it('warns without blocking when a skip does not reach the presentation', async () => {
    const presentation = { ...fakePresentation(), skip: vi.fn(() => Promise.reject(closed)) }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = renderOperator('#/operator', { presentation, repository: fakeRepository(snapshotOf(fourPlayerState())) })
    await user.click(await screen.findByRole('button', { name: 'Apresentar' }))
    await user.click(await screen.findByRole('button', { name: 'Saltar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(OUT_OF_DATE)
    expect(screen.getByRole('button', { name: 'Continuar torneio' })).toBeEnabled()
    log.mockRestore()
  })
})

describe('closed presentation window', () => {
  it('warns after the TV window closes and requests a new window on the next open', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const invoke = vi.fn(async (command: string) => {
      if (command === 'publish_presentation_state') throw closed
      return null
    })
    const session = renderSession(fakeRepository(), fourPlayerState(), { presentation: createTauriPresentationController(invoke) })
    await ready(session)
    await act(() => session.current!.openPresentation())
    act(() => session.current!.recordResult(firstResult(session.current!)))

    await vi.waitFor(() => expect(session.current!.notice).toEqual({ tone: 'warning', text: OUT_OF_DATE }))
    expect(session.current!.state!.auditLog).toHaveLength(1)
    await act(() => session.current!.openPresentation())
    expect(invoke.mock.calls.filter(([command]) => command === 'open_presentation_window')).toHaveLength(2)
    log.mockRestore()
  })

  it('stays quiet about updates while the TV was never opened', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'publish_presentation_state') throw closed
      return null
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = renderSession(fakeRepository(), fourPlayerState(), { presentation: createTauriPresentationController(invoke) })
    await ready(session)
    act(() => session.current!.recordResult(firstResult(session.current!)))
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('publish_presentation_state', expect.anything()))
    await act(async () => {})
    expect(session.current!.notice).toBeNull()
    log.mockRestore()
  })
})
