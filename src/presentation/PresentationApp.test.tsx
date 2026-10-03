import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOW } from '../app/testSupport'
import { drawGroups, proposeFormats, type ReadyProposal } from '../domain/formats'
import { createTournamentState } from '../domain/tournament'
import { fakeAudioContext } from '../test/fakeAudioContext'
import PresentationApp from './PresentationApp'
import type { PresentationSnapshot, PresentationState, PresentationUpdate } from './presentationState'
import { projectPresentation } from './projection'

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
const update = (state: PresentationState, seq: number, reveal = true): PresentationUpdate => ({ seq, reveal, state })
const snapshot = (published: PresentationUpdate | null, muted = false): PresentationSnapshot => ({ update: published, muted })
const listening = () => vi.waitFor(() => expect(tauri.handlers.size).toBe(3))

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
    groups: [{
      id: 'A',
      entrants: [{ name: 'Rui' }, { name: 'Ana' }, { name: 'Vencedor PE 1', description: 'Vencedor da Pré-eliminatória 1' }],
    }],
    preliminaryMatches: [{ label: 'Pré-eliminatória 1', shortLabel: 'PE 1', sides: ['Eva', 'Gil'] }],
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

afterEach(() => {
  vi.unstubAllGlobals()
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

  it('shows the draw with its groups, short placeholders and preliminary matches', () => {
    render(<PresentationApp initialState={drawState} />)
    const group = screen.getByRole('region', { name: 'Grupo A' })
    expect(within(group).getByText('Vencedor PE 1')).toBeVisible()
    expect(within(group).getByRole('listitem', { name: 'Vencedor da Pré-eliminatória 1' })).toBeVisible()
    expect(within(group).getByText('Rui')).toBeVisible()
    const preliminary = screen.getByRole('region', { name: 'Pré-eliminatória 1' })
    expect(within(preliminary).getByRole('heading', { name: 'Pré-eliminatória 1' })).toHaveTextContent(/^PE 1$/)
    expect(within(preliminary).getByText('Eva')).toBeVisible()
  })

  function drawFor(playerCount: number, preferredGroupSize: number, pick: (proposal: ReadyProposal) => boolean) {
    const players = Array.from({ length: playerCount }, (_, index) => ({ id: `p${index + 1}`, displayName: `Jogador ${index + 1}` }))
    const proposal = proposeFormats(playerCount, preferredGroupSize)
      .find(candidate => !candidate.creationBlocked && pick(candidate)) as ReadyProposal
    const state = createTournamentState({
      id: 't', name: 'Taça', players, proposal, createdAt: NOW,
      draw: drawGroups(players.map(player => player.id), proposal, () => 0),
    })
    return { state, projected: projectPresentation(state, { type: 'draw' }) }
  }

  it.each([
    { players: 29, groups: 5, size: 5, preliminaries: 4, cols: '5', rows: '2', lines: '5' },
    { players: 11, groups: 2, size: 5, preliminaries: 1, cols: '2', rows: '2', lines: '5' },
    { players: 32, groups: 8, size: 3, preliminaries: 8, cols: '5', rows: '4', lines: '3' },
  ])('sizes the cards by their lines: $players players, $groups×$size + $preliminaries', expected => {
    const { state, projected } = drawFor(
      expected.players, expected.size, p => p.groupCount === expected.groups && p.groupSize === expected.size)
    expect(state.preliminaryMatches).toHaveLength(expected.preliminaries)
    render(<PresentationApp initialState={projected} />)
    const draw = screen.getByTestId('draw')
    expect(draw.style.getPropertyValue('--lines')).toBe(expected.lines)
    expect(draw.style.getPropertyValue('--cols')).toBe(expected.cols)
    expect(draw.style.getPropertyValue('--rows')).toBe(expected.rows)
    // Short preliminary titles stay on one line; the full wording names the card.
    const last = `Pré-eliminatória ${expected.preliminaries}`
    expect(screen.getByRole('heading', { name: last })).toHaveTextContent(new RegExp(`^PE ${expected.preliminaries}$`))
  })

  it('fits the largest draw on one screen: ten groups in five columns, preliminaries in the same grid', () => {
    const { state, projected } = drawFor(32, 4, p => p.groupCount === 10)
    render(<PresentationApp initialState={projected} />)

    const draw = screen.getByTestId('draw')
    expect(draw.style.getPropertyValue('--cols')).toBe('5')
    expect(draw.style.getPropertyValue('--rows')).toBe(String(Math.ceil((10 + state.preliminaryMatches.length) / 5)))
    expect(screen.getAllByRole('region')).toHaveLength(10 + state.preliminaryMatches.length)
    // One fixed screen: the page itself never grows or scrolls.
    expect(screen.getByRole('main').className).toBe('presentation')
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
  it('fetches the last update on mount and follows published ones', async () => {
    tauri.invoke.mockResolvedValue(snapshot(update(resultState, 1)))
    const { unmount } = render(<PresentationApp />)
    expect(await screen.findByText('Rui')).toBeVisible()
    expect(tauri.invoke).toHaveBeenCalledWith('get_presentation_state')

    emit('presentation-state', update(championState, 2))
    expect(await screen.findByText('Campeão')).toBeInTheDocument()
    unmount()
    await vi.waitFor(() => expect(tauri.unlisten).toHaveBeenCalledTimes(3))
  })

  it('keeps the newest update whatever order the event and the initial read arrive in', async () => {
    let answer!: (value: PresentationSnapshot) => void
    tauri.invoke.mockImplementation(() => new Promise(resolve => { answer = resolve }))
    render(<PresentationApp />)
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalledWith('get_presentation_state'))
    emit('presentation-state', update(championState, 5))
    await act(async () => answer(snapshot(update(resultState, 4))))
    expect(screen.getByText('Campeão')).toBeInTheDocument()
    expect(screen.queryByText('Grupo A')).not.toBeInTheDocument()
  })

  it('drops a published update older than the one shown', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    await listening()
    emit('presentation-state', update(championState, 9))
    emit('presentation-state', update(resultState, 8))
    expect(screen.getByText('Campeão')).toBeInTheDocument()
    expect(screen.queryByText('Grupo A')).not.toBeInTheDocument()
  })

  it('reads the last update only once every listener is registered', async () => {
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
    await listening()
    emit('presentation-state', update(resultState, 1))
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'playing')

    emit('presentation-skip', null)
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done')
    expect(screen.getByText('Rui')).toBeVisible()
    expect(screen.getByText(/2 bolas/)).toBeVisible()
  })

  it('shows an update published without a reveal at once', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    await listening()
    emit('presentation-state', update(championState, 1, false))
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done')
    expect(screen.getByText('Campeão')).toBeVisible()
  })

  it('lets the reveal play for 2 to 5 seconds before it completes on its own', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    await listening()
    emit('presentation-state', update(championState, 1))
    await act(() => new Promise(resolve => setTimeout(resolve, 2000)))
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'playing')
    await vi.waitFor(() => expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done'), { timeout: 6000 })
    expect(screen.getByText('Campeão')).toBeVisible()
  }, 10000)

  it('shows an update read on mount without replaying its reveal', async () => {
    tauri.invoke.mockResolvedValue(snapshot(update(resultState, 3)))
    render(<PresentationApp />)
    await screen.findByText('Rui')
    expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done')
  })
})

describe('sound', () => {
  it('starts with sound, mutes from the TV and follows the operator', async () => {
    const user = userEvent.setup()
    tauri.invoke.mockImplementation(async command => command === 'get_presentation_state' ? snapshot(null) : null)
    render(<PresentationApp />)
    await user.click(await screen.findByRole('button', { name: 'Silenciar' }))
    expect(tauri.invoke).toHaveBeenCalledWith('set_presentation_muted', { muted: true })
    expect(screen.getByRole('button', { name: 'Ativar som' })).toBeVisible()

    await listening()
    emit('presentation-muted', false)
    expect(screen.getByRole('button', { name: 'Silenciar' })).toBeVisible()
  })

  it('restores the stored sound setting', async () => {
    tauri.invoke.mockResolvedValue(snapshot(null, true))
    render(<PresentationApp />)
    expect(await screen.findByRole('button', { name: 'Ativar som' })).toBeVisible()
  })

  it('never chimes before the stored sound setting is known', async () => {
    const audio = fakeAudioContext('running')
    vi.stubGlobal('AudioContext', audio.FakeContext)
    let answer!: (value: PresentationSnapshot) => void
    tauri.invoke.mockImplementation(() => new Promise(resolve => { answer = resolve }))
    render(<PresentationApp />)
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalledWith('get_presentation_state'))
    emit('presentation-state', update(resultState, 1))
    await act(async () => answer(snapshot(null, true)))
    expect(audio.contexts.flatMap(context => context.oscillators)).toHaveLength(0)
  })

  it('chimes for a revealed update once the setting is known', async () => {
    const audio = fakeAudioContext('running')
    vi.stubGlobal('AudioContext', audio.FakeContext)
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    await listening()
    await act(async () => {})
    emit('presentation-state', update(resultState, 1))
    await vi.waitFor(() => expect(audio.contexts.flatMap(context => context.oscillators)).toHaveLength(3))
    emit('presentation-state', { ...update({ kind: 'idle', tournamentName: 'Taça', payload: null }, 2), reveal: false })
    await act(async () => {})
    expect(audio.contexts.flatMap(context => context.oscillators)).toHaveLength(3)
  })

  it('asks for a click while the webview holds sound back, until it is allowed', async () => {
    const audio = fakeAudioContext('suspended')
    vi.stubGlobal('AudioContext', audio.FakeContext)
    tauri.invoke.mockResolvedValue(snapshot(null))
    render(<PresentationApp />)
    expect(await screen.findByText('Clique no ecrã para ativar o som')).toBeVisible()

    audio.gate.allowed = true
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole('main'))
    })
    await vi.waitFor(() => expect(screen.queryByText('Clique no ecrã para ativar o som')).not.toBeInTheDocument())
  })

  it('hides the click prompt while muted', async () => {
    const audio = fakeAudioContext('suspended')
    vi.stubGlobal('AudioContext', audio.FakeContext)
    tauri.invoke.mockResolvedValue(snapshot(null, true))
    render(<PresentationApp />)
    expect(await screen.findByRole('button', { name: 'Ativar som' })).toBeVisible()
    expect(screen.queryByText('Clique no ecrã para ativar o som')).not.toBeInTheDocument()
  })
})

describe('match spotlight', () => {
  const matchPayload = { stage: 'Grupo A', sides: ['Rui', 'Ana'] as [string, string] }

  it('announces the next match and cycles its templates with a pause in between', () => {
    vi.useFakeTimers()
    try {
      render(<PresentationApp initialState={{ kind: 'next', tournamentName: 'Taça', payload: matchPayload }} />)
      const spotlight = () => document.querySelector('.spotlight')!
      expect(screen.getByText('Próximo jogo')).toBeInTheDocument()
      expect(screen.getByText('Rui')).toBeInTheDocument()
      expect(spotlight()).toHaveAttribute('data-template', '0')
      act(() => { vi.advanceTimersByTime(6500) })
      expect(spotlight()).toHaveAttribute('data-resting', 'true')
      act(() => { vi.advanceTimersByTime(2500) })
      expect(spotlight()).toHaveAttribute('data-template', '1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a started match as live', () => {
    render(<PresentationApp initialState={{ kind: 'live', tournamentName: 'Taça', payload: matchPayload }} />)
    expect(screen.getByText('A decorrer')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('moves on from a result to the next match after a while', () => {
    vi.useFakeTimers()
    try {
      const state = withResult({ next: matchPayload })
      render(<PresentationApp initialState={state} />)
      expect(screen.queryByText('Próximo jogo')).not.toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(10_000) })
      expect(screen.getByText('Próximo jogo')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

