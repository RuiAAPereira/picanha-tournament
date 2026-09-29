import { useId, useState, type FormEvent } from 'react'
import type { TournamentPlayer } from '../../domain/tournament'
import type { MatchId, MatchResult } from '../../domain/types'
import type { ResultEntry } from '../useTournamentSession'
import Modal from './Modal'

const ALL_BALLS = 7

type ResultDialogProps = {
  matchId: MatchId
  players: [TournamentPlayer, TournamentPlayer]
  mode?: 'record' | 'correct'
  initial?: MatchResult
  /** A thrown error is shown inline and keeps the dialog open. */
  onConfirm(entry: ResultEntry): void | Promise<void>
  onCancel(): void
  returnFocus?: () => HTMLElement | null
}

type DialogError = { field: 'winner' | 'balls' | null; text: string }

export default function ResultDialog({ matchId, players, mode = 'record', initial, onConfirm, onCancel, returnFocus }: ResultDialogProps) {
  const [winnerId, setWinnerId] = useState(initial?.winnerId ?? '')
  const [balls, setBalls] = useState(initial?.kind === 'played' ? String(initial.loserBallsRemaining) : '')
  const [withdrawal, setWithdrawal] = useState(initial?.kind === 'withdrawal')
  const [error, setError] = useState<DialogError | null>(null)
  const ballsId = useId()
  const errorId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!winnerId) return setError({ field: 'winner', text: 'Escolha o vencedor.' })
    const loserBallsRemaining = withdrawal ? ALL_BALLS : balls.trim() === '' ? NaN : Number(balls)
    if (!Number.isInteger(loserBallsRemaining) || loserBallsRemaining < 0 || loserBallsRemaining > ALL_BALLS) {
      return setError({ field: 'balls', text: `As bolas deixadas têm de ser um número inteiro de 0 a ${ALL_BALLS}.` })
    }
    try {
      await onConfirm({ matchId, winnerId, loserBallsRemaining, kind: withdrawal ? 'withdrawal' : 'played' })
    } catch (failure) {
      setError({ field: null, text: failure instanceof Error ? failure.message : 'Não foi possível guardar o resultado.' })
    }
  }

  return (
    <Modal title={mode === 'correct' ? 'Corrigir resultado' : 'Registar resultado'} onCancel={onCancel} returnFocus={returnFocus}>
      <p>{players[0].displayName} contra {players[1].displayName}</p>
      <form onSubmit={submit} noValidate>
        <fieldset aria-describedby={error?.field === 'winner' ? errorId : undefined}>
          <legend>Vencedor</legend>
          {players.map(player => (
            <label key={player.id} className="choice">
              <input
                type="radio"
                name="winner"
                value={player.id}
                checked={winnerId === player.id}
                onChange={() => setWinnerId(player.id)}
              />
              {player.displayName}
            </label>
          ))}
        </fieldset>
        <label htmlFor={ballsId}>Bolas deixadas pelo derrotado</label>
        <input
          id={ballsId}
          type="number"
          inputMode="numeric"
          min={0}
          max={ALL_BALLS}
          step={1}
          value={withdrawal ? String(ALL_BALLS) : balls}
          disabled={withdrawal}
          aria-invalid={error?.field === 'balls'}
          aria-describedby={error?.field === 'balls' ? errorId : undefined}
          onChange={event => setBalls(event.target.value)}
        />
        <label className="choice">
          <input type="checkbox" checked={withdrawal} onChange={event => setWithdrawal(event.target.checked)} />
          Desistência (o derrotado fica com as {ALL_BALLS} bolas)
        </label>
        {error && <p id={errorId} role="alert" className="error">{error.text}</p>}
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary">Confirmar resultado</button>
        </div>
      </form>
    </Modal>
  )
}
