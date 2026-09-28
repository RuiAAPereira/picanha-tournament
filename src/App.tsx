import { useSyncExternalStore } from 'react'

function subscribeToHashChange(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export default function App() {
  const route = useSyncExternalStore(
    subscribeToHashChange,
    () => window.location.hash,
    () => '#/operator',
  )

  if (route === '#/presentation') {
    return (
      <main aria-label="Apresentação">
        <h1>Apresentação</h1>
        <p>A apresentação do torneio ficará disponível aqui.</p>
      </main>
    )
  }

  return (
    <main aria-label="Torneio">
      <h1>Picanha Tournament</h1>
      <p>Área do organizador</p>
    </main>
  )
}
