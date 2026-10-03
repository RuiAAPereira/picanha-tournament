import { motion } from 'framer-motion'
import { useId, type CSSProperties } from 'react'
import type { DrawGroupView, DrawPayload, PreliminaryView } from './presentationState'
import { revealItem } from './Reveal'

const MAX_COLUMNS = 5

/** Two rows of groups where possible, never more than five columns; preliminaries fill the next cells. */
export const drawColumns = (groupCount: number) => Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(groupCount / 2)))

function GroupCard({ group }: { group: DrawGroupView }) {
  const titleId = useId()
  return (
    <motion.section className="card" aria-labelledby={titleId} variants={revealItem}>
      <h2 id={titleId}>{`Grupo ${group.id}`}</h2>
      <ol>
        {group.entrants.map((entrant, index) => (
          <li key={index} aria-label={entrant.description}>{entrant.name}</li>
        ))}
      </ol>
    </motion.section>
  )
}

function PreliminaryCard({ match }: { match: PreliminaryView }) {
  const titleId = useId()
  return (
    <motion.section className="card preliminary" aria-labelledby={titleId} variants={revealItem}>
      <h2 id={titleId}>{match.label}</h2>
      <ul>
        <li>{match.sides[0]}</li>
        <li className="versus">contra</li>
        <li>{match.sides[1]}</li>
      </ul>
    </motion.section>
  )
}

/**
 * The drawn groups, one by one, then the preliminary matches that feed them, all in one grid sized
 * from the group count so even the largest formats fit the screen without scrolling.
 */
export default function DrawPresentation({ payload }: { payload: DrawPayload }) {
  const cells = payload.groups.length + payload.preliminaryMatches.length
  const columns = drawColumns(payload.groups.length)
  const rows = Math.max(1, Math.ceil(cells / columns))
  const style = { '--cols': columns, '--rows': rows } as CSSProperties
  return (
    <div className="draw" style={style} data-testid="draw">
      <motion.h1 className="eyebrow" variants={revealItem}>Sorteio</motion.h1>
      <div className="groups">
        {payload.groups.map((group, index) => <GroupCard key={index} group={group} />)}
        {payload.preliminaryMatches.map((match, index) => <PreliminaryCard key={index} match={match} />)}
      </div>
    </div>
  )
}
