import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import PresentationApp from './PresentationApp'
import type { PresentationState } from './presentationState'

// Its own file: framer-motion reads the reduced-motion preference once per module instance.
const tauri = vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  return { handlers: new Map<string, (event: { payload: unknown }) => void>() }
})

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({ state: null, muted: false })) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    tauri.handlers.set(event, handler)
    return () => {}
  }),
}))

const resultState: PresentationState = {
  kind: 'result',
  tournamentName: 'Taça',
  payload: { stage: 'Final', winner: 'Rui', loser: 'Ana', loserBallsRemaining: 2, withdrawal: false, corrected: false },
}

it('shows a new state at once, without a reveal, when reduced motion is preferred', async () => {
  render(<PresentationApp />)
  await vi.waitFor(() => expect(tauri.handlers.has('presentation-state')).toBe(true))
  act(() => tauri.handlers.get('presentation-state')!({ payload: resultState }))
  expect(screen.getByTestId('reveal')).toHaveAttribute('data-reveal', 'done')
  expect(screen.getByText('Rui')).toBeVisible()
  expect(screen.getByText(/2 bolas/)).toBeVisible()
})
