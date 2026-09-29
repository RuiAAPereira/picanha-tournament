import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { proposeFormats, type ReadyProposal } from '../../domain/formats'
import type { TournamentPlayer } from '../../domain/tournament'
import { navigate, ROUTES } from '../hashRoute'
import { slugify } from '../slugs'
import { useTournamentSession } from '../useTournamentSession'

const countText = (count: number) => `${count} ${count === 1 ? 'jogador' : 'jogadores'}`

/** Back from the draw step, the previously chosen format stays selected. */
function initialChoice(proposal: ReadyProposal | undefined): number {
  if (!proposal) return 0
  const index = proposeFormats(proposal.playerCount)
    .filter((candidate): candidate is ReadyProposal => !candidate.creationBlocked)
    .findIndex(candidate => candidate.groupSize === proposal.groupSize && candidate.groupCount === proposal.groupCount)
  return Math.max(index, 0)
}

export default function NewTournamentPage() {
  const session = useTournamentSession()
  const [name, setName] = useState(session.setup?.name ?? '')
  const [players, setPlayers] = useState<TournamentPlayer[]>(session.setup?.players ?? [])
  const [entry, setEntry] = useState('')
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [choice, setChoice] = useState(() => ({ count: players.length, index: initialChoice(session.setup?.proposal) }))
  const ids = { name: useId(), formError: useId(), player: useId(), playerError: useId(), reason: useId() }

  const proposals = proposeFormats(players.length)
  const [top] = proposals
  const ready = proposals.filter((proposal): proposal is ReadyProposal => !proposal.creationBlocked)
  // A different player count means different proposals, so the choice falls back to the recommendation.
  const chosenIndex = choice.count === players.length && choice.index < ready.length ? choice.index : 0

  function addPlayer() {
    const displayName = entry.trim().replace(/\s+/g, ' ')
    if (!displayName) return
    const id = slugify(displayName)
    if (!id) return setPlayerError('O nome tem de ter pelo menos uma letra ou um número.')
    if (players.some(player => player.id === id)) return setPlayerError('Já existe um jogador com esse nome.')
    setPlayers([...players, { id, displayName }])
    setEntry('')
    setPlayerError(null)
  }

  function onEntryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addPlayer()
  }

  function create(event: FormEvent) {
    event.preventDefault()
    if (top.creationBlocked) return
    if (!name.trim()) return setFormError('Indique o nome do torneio.')
    session.createTournament({ name: name.trim(), players, proposal: ready[chosenIndex] })
    navigate(ROUTES.draw)
  }

  return (
    <section aria-labelledby="new-title">
      <h2 id="new-title">Novo torneio</h2>
      <form onSubmit={create} noValidate>
        <label htmlFor={ids.name}>Nome do torneio</label>
        <input
          id={ids.name}
          value={name}
          required
          aria-invalid={!!formError}
          aria-describedby={formError ? ids.formError : undefined}
          onChange={event => {
            setName(event.target.value)
            setFormError(null)
          }}
        />

        <h3>Inscrições</h3>
        <div className="inline">
          <label htmlFor={ids.player}>Jogador</label>
          <input
            id={ids.player}
            value={entry}
            aria-invalid={!!playerError}
            aria-describedby={playerError ? ids.playerError : undefined}
            onChange={event => setEntry(event.target.value)}
            onKeyDown={onEntryKeyDown}
          />
          <button type="button" onClick={addPlayer}>Adicionar</button>
        </div>
        {playerError && <p id={ids.playerError} role="alert" className="error">{playerError}</p>}
        <p>{countText(players.length)}</p>
        <ol aria-label="Inscritos" className="players">
          {players.map(player => (
            <li key={player.id}>
              {player.displayName}{' '}
              <button
                type="button"
                aria-label={`Remover ${player.displayName}`}
                onClick={() => setPlayers(players.filter(candidate => candidate.id !== player.id))}
              >
                Remover
              </button>
            </li>
          ))}
        </ol>

        <fieldset>
          <legend>Formato</legend>
          <section aria-labelledby="recommended-title">
            <h3 id="recommended-title">Formato recomendado</h3>
            {ready.length > 1 ? (
              <FormatChoice proposal={ready[0]} index={0} label="Recomendado" chosen={chosenIndex} reasonId={ids.reason}
                onChoose={index => setChoice({ count: players.length, index })} />
            ) : <p>{top.reason}</p>}
          </section>
          {ready.length > 1 && (
            <section aria-labelledby="alternatives-title">
              <h3 id="alternatives-title">Alternativas</h3>
              {ready.slice(1).map((proposal, offset) => (
                <FormatChoice key={offset} proposal={proposal} index={offset + 1} label={`Alternativa ${offset + 1}`}
                  chosen={chosenIndex} reasonId={ids.reason} onChoose={index => setChoice({ count: players.length, index })} />
              ))}
            </section>
          )}
        </fieldset>

        {formError && <p id={ids.formError} role="alert" className="error">{formError}</p>}
        <div className="actions">
          <a href={ROUTES.home}>Voltar</a>
          <button type="submit" className="primary" disabled={top.creationBlocked}>Criar e sortear</button>
        </div>
      </form>
    </section>
  )
}

type FormatChoiceProps = {
  proposal: ReadyProposal
  index: number
  label: string
  chosen: number
  reasonId: string
  onChoose(index: number): void
}

function FormatChoice({ proposal, index, label, chosen, reasonId, onChoose }: FormatChoiceProps) {
  const descriptionId = `${reasonId}-${index}`
  return (
    <div className="format-choice">
      <label className="choice">
        <input
          type="radio"
          name="format"
          checked={chosen === index}
          aria-describedby={descriptionId}
          onChange={() => onChoose(index)}
        />
        {label}
      </label>
      <p id={descriptionId}>{proposal.reason}</p>
    </div>
  )
}
