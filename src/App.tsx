import { ROUTES, useHashRoute } from './app/hashRoute'
import OperatorApp from './app/OperatorApp'
import { TournamentProvider } from './app/TournamentProvider'

export default function App() {
  const route = useHashRoute()

  // The presentation always runs in its own window, so it never shares the operator session.
  if (route === ROUTES.presentation) {
    return (
      <main aria-label="Apresentação">
        <h1>Apresentação</h1>
        <p>A apresentação do torneio ficará disponível aqui.</p>
      </main>
    )
  }

  return (
    <TournamentProvider>
      <OperatorApp />
    </TournamentProvider>
  )
}
