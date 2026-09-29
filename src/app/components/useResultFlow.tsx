import { useState, type ReactNode } from 'react'
import { findMatch, isKnockoutMatch, type TournamentPlayer, type TournamentState } from '../../domain/tournament'
import type { MatchId } from '../../domain/types'
import { matchLabel } from '../labels'
import { useTournamentSession, type ResultEntry } from '../useTournamentSession'
import CorrectionConfirmDialog from './CorrectionConfirmDialog'
import ResultDialog from './ResultDialog'

export type ResultFlow = { record(matchId: MatchId): void; correct(matchId: MatchId): void }

type Editing = { matchId: MatchId; mode: 'record' | 'correct' }
type PendingCorrection = { entry: ResultEntry; invalidated: string[] }

function playersOf(state: TournamentState, matchId: MatchId): [TournamentPlayer, TournamentPlayer] | null {
  const match = findMatch(state, matchId)
  if (!match) return null
  const ids = isKnockoutMatch(match) ? [match.homePlayerId, match.awayPlayerId] : [match.player1Id, match.player2Id]
  const players = ids.map(id => state.players.find(player => player.id === id))
  return players[0] && players[1] ? [players[0], players[1]] : null
}

/** Result entry and correction for any match: the dialog, then a destructive confirmation when later matches change. */
export function useResultFlow(): ResultFlow & { dialogs: ReactNode } {
  const session = useTournamentSession()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [pending, setPending] = useState<PendingCorrection | null>(null)
  const { state } = session
  const players = state && editing ? playersOf(state, editing.matchId) : null

  function confirm(entry: ResultEntry) {
    if (editing?.mode === 'record') {
      session.recordResult(entry)
    } else {
      const outcome = session.correctResult(entry)
      if (!outcome.applied && state) {
        setPending({ entry, invalidated: outcome.invalidatedMatchIds.map(id => matchLabel(state, id)) })
      }
    }
    setEditing(null)
  }

  const dialogs = (
    <>
      {editing && players && (
        <ResultDialog
          matchId={editing.matchId}
          players={players}
          mode={editing.mode}
          initial={state ? findMatch(state, editing.matchId)?.result : undefined}
          onConfirm={confirm}
          onCancel={() => setEditing(null)}
        />
      )}
      {pending && (
        <CorrectionConfirmDialog
          invalidated={pending.invalidated}
          onConfirm={() => {
            session.correctResult(pending.entry, true)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )

  return {
    record: matchId => setEditing({ matchId, mode: 'record' }),
    correct: matchId => setEditing({ matchId, mode: 'correct' }),
    dialogs,
  }
}
