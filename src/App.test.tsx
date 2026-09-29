import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }))

afterEach(() => {
  window.location.hash = ''
})

it('renders the operator shell', async () => {
  window.location.hash = '#/operator'
  render(<App />)
  expect(screen.getByRole('main', { name: /torneio/i })).toBeVisible()
  expect(await screen.findByRole('button', { name: 'Novo torneio' })).toBeEnabled()
})

it('renders a read-only presentation placeholder', () => {
  window.location.hash = '#/presentation'
  render(<App />)
  expect(screen.getByRole('main', { name: /apresentação/i })).toBeVisible()
  expect(screen.queryByRole('main', { name: /torneio/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
