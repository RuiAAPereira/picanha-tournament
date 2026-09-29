import './app.css'
import { ROUTES, useHashRoute } from './hashRoute'
import OperatorLayout from './OperatorLayout'
import BracketPage from './routes/BracketPage'
import DrawPage from './routes/DrawPage'
import GroupsPage from './routes/GroupsPage'
import HomePage from './routes/HomePage'
import NewTournamentPage from './routes/NewTournamentPage'

const PAGES = {
  [ROUTES.newTournament]: NewTournamentPage,
  [ROUTES.draw]: DrawPage,
  [ROUTES.groups]: GroupsPage,
  [ROUTES.bracket]: BracketPage,
} as Record<string, () => React.JSX.Element>

/** Operator routes under `#/operator`; anything unknown shows the home page. */
export default function OperatorApp() {
  const route = useHashRoute()
  const Page = PAGES[route] ?? HomePage
  return (
    <OperatorLayout>
      <Page />
    </OperatorLayout>
  )
}
