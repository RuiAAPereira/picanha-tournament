import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PresentationApp from './PresentationApp'
import type { PresentationSnapshot, PresentationState } from './presentationState'

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(async (_command: string, _args?: unknown): Promise<unknown> => null),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    tauri.handlers.set(event, handler)
    return tauri.unlisten
  }),
}))

const emit = (event: string, payload: unknown) => act(() => tauri.handlers.get(event)!({ payload }))

const resultState: PresentationState = {
  kind: 'result',
  tournamentName: 'Taça da Picanha',
  payload: { stage: 'Grupo A', winner: 'Rui', loser: 'Ana', loserBallsRemaining: 2, withdrawal: false, corrected: false },
}
const championState: PresentationState = {
  kind: 'champion', tournamentName: 'Taça da Picanha', payload: { champion: 'Rui', runnerUp: 'Ana' },
}
const drawState: PresentationState = {
  kind: 'draw',
  tournamentName: 'Taça da Picanha',
  payload: {
    groups: [{ id: 'A', entrants: ['Rui', 'Ana', 'Vencedor da Pré-eliminatória 1'] }],
    preliminaryMatches: [{ label: 'Pré-eliminatória 1', sides: ['Eva', 'Gil'] }],
  },
}

const withResult = (payload: Partial<Extract<PresentationState, { kind: 'result' }>['payload']>): PresentationState =>
  ({ ...resultState, payload: { ...(resultState.payload as object), ...payload } } as PresentationState)

beforeEach(() => {
  tauri.handlers.clear()
  tauri.unlisten.mockClear()
  tauri.invoke.mockReset()
  tauri.invoke.mockImplementation(async () => null)
})

describe('PresentationApp', () => {
  it('shows a result with the winner and the balls left', () => {
    render(<PresentationApp initialState={resultState} />)
    expect(screen.getByText('Rui')).toBeVisible()
    expect(screen.getByText(/2 bolas/i)).toBeVisible()
    expect(screen.getByText('Grupo A')).toBeVisible()
    expect(screen.getByText('Ana')).toBeVisible()
  })

  it('uses the singular, marks withdrawals and corrected results', () => {
    const { unmount } = render(<PresentationApp initialState={withResult({ loserBallsRemaining: 1 })} />)
    expect(screen.getByText(/1 bola\b/i)).toBeVisible()
    unmount()
    render(<PresentationApp initialState={withResult({ withdrawal: true, corrected: true })} />)
    expect(screen.getByText('Desistência')).toBeVisible()
    expect(screen.getByText('Resultado corrigido')).toBeVisible()
    expect(screen.queryByText(/bolas?\b/)).not.toBeInTheDocument()
  })

  it('shows the draw with its groups and preliminary matches', () => {
    render(<PresentationApp initialState={drawState} />)
    const group = screen.getByRole('region', { name: 'Grupo A' })
    expect(within(group).getByText('Vencedor da Pré-eliminatória 1')).toBeVisible()
    expect(within(group).getByText('Rui')).toBeVisible()
    expect(screen.getByText('Pré-eliminatória 1')).toBeVisible()
    expect(screen.getByText('Eva')).toBeVisible()
  })

  it('shows the champion and the runner-up', () => {
    render(<PresentationApp initialState={championState} />)
    expect(screen.getByRole('heading', { name: 'Rui' })).toBeVisible()
    expect(screen.getByText('Campeão')).toBeVisible()
    expect(screen.getByText(/Ana/)).toBeVisible()
  })

  it('shows only the tournament name while idle, with no operator controls', () => {
    render(<PresentationApp initialState={{ kind: 'idle', tournamentName: 'Taça da Picanha', payload: null }} />)
    expect(screen.getByRole('heading', { name: 'Taça da Picanha' })).toBeVisible()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Silenciar' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /saltar|apresentar/i })).not.toBeInTheDocument()
  })
})

describe('live updates', () => {
  const snapshot = (state: PresentationState | null, muted = false): PresentationSnapshot => ({ state, muted })

  it('fetches the last state on mount and follows published states', async () => {
    tauri.invoke.mockResolvedValue(snapshot(resultState))
    const { unmount } = render(<PresentationApp />)
    expect(await screen.findByText('Rui')).toBeVisible()
    expect(tauri.invoke).toHaveBeenCalledWith('get_presentation_state')

    emit('presentation-state', championState)
    expect(await screen.findByText('Campeão')).toBeInTheDocument()
    unmount()
    await vi.waitFor(() => expect(tauri.unlisten).toHaveBeenCalledTimes(3))
  })

  it('keeps a published state that arrives before the initial fetch', async () => {
    let answer!: (value: PresentationSnapshot) => void
    tauri.invoke.mockImplementation(() => new Promise(resolve => { answer = resolve }))
    render(<PresentationApp />)
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalledWith('get_presentation_state'))
    emit('presentation-state', championState)
    await act(async () => answer(snapshot(resultState)))
    expect(screen.getByText('Campeão')).toBeInTheDocument()
    expect(screen.queryByText('Grupo A')).not.toBeInTheDocument()
  })

  it('reads the last state only once every listener is registered', async () => {
    let listenersAtFetch = -1
    tauri.invoke.mockImplementation(async () => {
      listenersAtFetch = tauri.handlers.size
      return snapshot(null)
    })
    render(<PresentationApp />)
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalledWith('get_presentation_state'))
    expect(listenersAtFetch).toBe(3)
  })

  it('shows a waiting screen before anything is published', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    expect(await screen.findByRole('heading', { name: 'Picanha Tournament' })).toBeVisible()
  })

  it('plays the reveal of a new state and completes it at once when skipped', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    await vi.waitFor(() => expect(tauri.handlers.has('presentation-skip')).toBe(true))
    emit('presentation-state', resultState)
    const reveal = screen.getByTestId('reveal')
    expect(reveal).toHaveAttribute('data-reveal', 'playing')

    emit('presentation-skip', null)
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done')
    expect(screen.getByText('Rui')).toBeVisible()
    expect(screen.getByText(/2 bolas/)).toBeVisible()
  })

  it('lets the reveal play for 2 to 5 seconds before it completes on its own', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    await vi.waitFor(() => expect(tauri.handlers.has('presentation-state')).toBe(true))
    emit('presentation-state', championState)
    await act(() => new Promise(resolve => setTimeout(resolve, 2000)))
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'playing')
    await vi.waitFor(() => expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done'), { timeout: 6000 })
    expect(screen.getByText('Campeão')).toBeVisible()
  }, 10000)

  it('shows a state received on mount without replaying its reveal', async () => {
    tauri.invoke.mockResolvedValue(snapshot(resultState))
    render(<PresentationApp />)
    await screen.findByText('Rui')
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done')
  })

  it('starts with sound, mutes from the TV and follows the operator', async () => {
    const user = userEvent.setup()
    tauri.invoke.mockImplementation(async command => command === 'get_presentation_state' ? snapshot(null) : null)
    render(<PresentationApp />)
    await user.click(await screen.findByRole('button', { name: 'Silenciar' }))
    expect(tauri.invoke).toHaveBeenCalledWith('set_presentation_muted', { muted: true })
    expect(screen.getByRole('button', { name: 'Ativar som' })).toBeVisible()

    await vi.waitFor(() => expect(tauri.handlers.has('presentation-muted')).toBe(true))
    emit('presentation-muted', false)
    expect(screen.getByRole('button', { name: 'Silenciar' })).toBeVisible()
  })

  it('restores the stored sound setting', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null, true))
    render(<PresentationApp />)
    expect(await screen.findByRole('button', { name: 'Ativar som' })).toBeVisible()
  })
})
