import { render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import App from './App'

afterEach(() => {
  window.location.hash = ''
})

it('renders the operator shell', () => {
  window.location.hash = '#/operator'
  render(<App />)
  expect(screen.getByRole('main', { name: /torneio/i })).toBeVisible()
})

it('renders a read-only presentation placeholder', () => {
  window.location.hash = '#/presentation'
  render(<App />)
  expect(screen.getByRole('main', { name: /apresentação/i })).toBeVisible()
  expect(screen.queryByRole('main', { name: /torneio/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
