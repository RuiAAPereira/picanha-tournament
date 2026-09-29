import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { drawGroups, proposeFormats, type ReadyProposal } from '../domain/formats'
import { applyMatchResult, createTournamentState, type TournamentState } from '../domain/tournament'
import {
  TOURNAMENT_SNAPSHOT_SCHEMA_VERSION, type TournamentRepository, type TournamentSnapshot,
} from '../platform/tournamentRepository'
import OperatorApp from './OperatorApp'
import { TournamentProvider, type TournamentProviderProps } from './TournamentProvider'
import { useTournamentSession, type TournamentSession } from './useTournamentSession'

export const NOW = '2026-09-28T20:15:30.000Z'

export function fakeRepository(current: TournamentSnapshot | null = null) {
  const repository = {
    loadCurrent: vi.fn(async (): Promise<TournamentSnapshot | null> => current),
    save: vi.fn(async (_snapshot: TournamentSnapshot) => {}),
    list: vi.fn(async () => []),
    exportBackup: vi.fn(async (_tournamentId: string, _destination: string) => {}),
  } satisfies TournamentRepository
  return repository
}

export type FakeRepository = ReturnType<typeof fakeRepository>

type OperatorProps = Omit<TournamentProviderProps, 'children' | 'repository'> & { repository?: FakeRepository }

export function renderOperator(route: string, props: OperatorProps = {}) {
  window.location.hash = route
  const user = userEvent.setup()
  const repository = props.repository ?? fakeRepository()
  render(
    <TournamentProvider now={() => NOW} random={() => 0} {...props} repository={repository}>
      <OperatorApp />
    </TournamentProvider>,
  )
  return { user, repository }
}

const NAMES = ['Ana', 'Bruno', 'Carla', 'Duarte']

/** Four players in one group; the final is 1.º against 2.º. */
export function fourPlayerState(): TournamentState {
  const players = NAMES.map(name => ({ id: name.toLowerCase(), displayName: name }))
  const proposal = proposeFormats(4)[0] as ReadyProposal
  return createTournamentState({
    id: 'torneio-20260928-200000',
    name: 'Torneio',
    players,
    proposal,
    draw: drawGroups(players.map(player => player.id), proposal, () => 0),
    createdAt: '2026-09-28T20:00:00.000Z',
  })
}

/** Plays every pending group match; the player listed first in `order` wins, the loser leaves 1 ball. */
export function playGroups(state: TournamentState, order: string[]): TournamentState {
  return state.groups.flatMap(group => group.matches).reduce((current, match) => applyMatchResult(current, {
    matchId: match.id,
    winnerId: order.indexOf(match.player1Id) < order.indexOf(match.player2Id) ? match.player1Id : match.player2Id,
    loserBallsRemaining: 1,
    at: NOW,
  }), state)
}

export const snapshotOf = (state: TournamentState): TournamentSnapshot => ({
  schemaVersion: TOURNAMENT_SNAPSHOT_SCHEMA_VERSION,
  tournamentId: state.id,
  name: state.name,
  savedAt: NOW,
  status: 'in_progress',
  state,
})

export function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

/** Renders the provider with a probe; `state`, when given, is what the repository loads. */
export function renderSession(repository: FakeRepository, state: TournamentState | null, props: OperatorProps = {}) {
  const session: { current: TournamentSession | null } = { current: null }
  function Probe() {
    session.current = useTournamentSession()
    return null
  }
  if (state) repository.loadCurrent.mockResolvedValue(snapshotOf(state))
  render(<TournamentProvider now={() => NOW} random={() => 0} {...props} repository={repository}><Probe /></TournamentProvider>)
  return session
}
