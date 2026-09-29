import { ROUTES, useHashRoute } from './app/hashRoute'
import OperatorApp from './app/OperatorApp'
import { TournamentProvider } from './app/TournamentProvider'
import PresentationApp from './presentation/PresentationApp'

export default function App() {
  const route = useHashRoute()

  // The presentation always runs in its own window, so it never shares the operator session.
  if (route === ROUTES.presentation) return <PresentationApp />

  return (
    <TournamentProvider>
      <OperatorApp />
    </TournamentProvider>
  )
}
