import { useSyncExternalStore } from 'react'

export const ROUTES = {
  home: '#/operator',
  newTournament: '#/operator/new',
  draw: '#/operator/draw',
  groups: '#/operator/groups',
  bracket: '#/operator/bracket',
  presentation: '#/presentation',
} as const

function subscribeToHashChange(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export const useHashRoute = () => useSyncExternalStore(
  subscribeToHashChange,
  () => window.location.hash,
  () => ROUTES.home,
)

export function navigate(route: string) {
  window.location.hash = route
}
