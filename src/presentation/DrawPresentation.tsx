import { motion } from 'framer-motion'
import { useId } from 'react'
import type { DrawGroupView, DrawPayload } from './presentationState'
import { revealItem } from './Reveal'

function GroupCard({ group }: { group: DrawGroupView }) {
  const titleId = useId()
  return (
    <motion.section className="card" aria-labelledby={titleId} variants={revealItem}>
      <h2 id={titleId}>{`Grupo ${group.id}`}</h2>
      <ol>
        {group.entrants.map(name => <li key={name}>{name}</li>)}
      </ol>
    </motion.section>
  )
}

/** The drawn groups, one by one, then the preliminary matches that feed them. */
export default function DrawPresentation({ payload }: { payload: DrawPayload }) {
  const preliminaryId = useId()
  return (
    <div className="draw">
      <motion.h1 className="eyebrow" variants={revealItem}>Sorteio</motion.h1>
      <div className="groups">
        {payload.groups.map(group => <GroupCard key={group.id} group={group} />)}
      </div>
      {payload.preliminaryMatches.length > 0 && (
        <motion.section className="card preliminaries" aria-labelledby={preliminaryId} variants={revealItem}>
          <h2 id={preliminaryId}>Pré-eliminatórias</h2>
          <ul>
            {payload.preliminaryMatches.map(match => (
              <li key={match.label}>
                <span className="label">{match.label}</span>
                <span>{match.sides[0]}</span>
                <span className="versus">contra</span>
                <span>{match.sides[1]}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </div>
  )
}
