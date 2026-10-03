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
  expect(screen.getByRole('button', { name: 'Carregar demonstração' })).toBeEnabled()
})

it('renders the read-only presentation, with only a mute button', async () => {
  window.location.hash = '#/presentation'
  render(<App />)
  expect(screen.getByRole('main', { name: /apresentação/i })).toBeVisible()
  expect(await screen.findByRole('heading', { name: 'Picanha Tournament' })).toBeVisible()
  expect(screen.queryByRole('main', { name: /torneio/i })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Silenciar'])
})
