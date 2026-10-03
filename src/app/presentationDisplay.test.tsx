import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PresentationDisplay, PresentationSignal } from '../platform/presentationPort'
import { renderOperator } from './testSupport'

const REMEMBERED_KEY = 'picanha.presentationDisplay'
const ONE = String.raw`\\.\DISPLAY1`
const TWO = String.raw`\\.\DISPLAY2`
const TV = String.raw`\\.\DISPLAY3`
const display = (id: string, label: string, width: number, height: number, primary = false): PresentationDisplay =>
  ({ id, label, width, height, x: 0, y: 0, primary, scaleFactor: 1 })
const DISPLAYS = [
  display(ONE, 'Ecrã 1', 1080, 1920),
  display(TWO, 'Ecrã 2', 3440, 1440, true),
  display(TV, 'Ecrã 3', 1920, 1080),
]

afterEach(() => {
  window.location.hash = ''
  localStorage.clear()
})

function fakePresentation(displays: PresentationDisplay[] = DISPLAYS) {
  const signals: { listener: ((signal: PresentationSignal) => void) | null } = { listener: null }
  return {
    signals,
    open: vi.fn(async (_display?: string) => {}),
    close: vi.fn(async () => {}),
    listDisplays: vi.fn(async () => displays),
    readMuted: vi.fn(async () => false),
    subscribe: vi.fn((listener: (signal: PresentationSignal) => void) => {
      signals.listener = listener
      return () => {
        signals.listener = null
      }
    }),
  }
}

const picker = () => screen.getByRole('combobox', { name: 'Ecrã da apresentação' })
const optionNames = () => within(picker()).getAllByRole('option').map(option => option.textContent)

describe('choosing the presentation display', () => {
  it('lists the displays and starts on the first one that is not the main screen', async () => {
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await screen.findByRole('option', { name: 'Ecrã 3 — 1920×1080' })
    expect(optionNames()).toEqual([
      'Ecrã 1 — 1080×1920', 'Ecrã 2 — 3440×1440 (principal)', 'Ecrã 3 — 1920×1080', 'Janela (neste ecrã)',
    ])
    expect(picker()).toHaveValue(ONE)

    await user.click(screen.getByRole('button', { name: 'Apresentar' }))
    expect(presentation.open).toHaveBeenCalledWith(ONE)
  })

  it('remembers the chosen display', async () => {
    localStorage.setItem(REMEMBERED_KEY, TV)
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await vi.waitFor(() => expect(picker()).toHaveValue(TV))

    await user.selectOptions(picker(), 'Janela (neste ecrã)')
    expect(localStorage.getItem(REMEMBERED_KEY)).toBe('window')
    await user.click(screen.getByRole('button', { name: 'Apresentar' }))
    expect(presentation.open).toHaveBeenCalledWith('window')
  })

  it('ignores a remembered display that is no longer connected', async () => {
    localStorage.setItem(REMEMBERED_KEY, String.raw`\\.\DISPLAY9`)
    renderOperator('#/operator', { presentation: fakePresentation() })
    await vi.waitFor(() => expect(picker()).toHaveValue(ONE))
  })

  it('offers a window only, outside the app or with a single screen', async () => {
    renderOperator('#/operator', { presentation: { ...fakePresentation(), listDisplays: undefined } })
    await screen.findByRole('button', { name: 'Apresentar' })
    expect(optionNames()).toEqual(['Janela (neste ecrã)'])
    expect(picker()).toHaveValue('window')
  })

  it('refreshes the list when the picker is focused and after opening', async () => {
    const presentation = fakePresentation()
    presentation.listDisplays.mockResolvedValueOnce([DISPLAYS[1]])
    const { user } = renderOperator('#/operator', { presentation })
    await screen.findByRole('option', { name: 'Ecrã 2 — 3440×1440 (principal)' })
    expect(picker()).toHaveValue('window')

    act(() => picker().focus())
    await screen.findByRole('option', { name: 'Ecrã 3 — 1920×1080' })
    const listed = presentation.listDisplays.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Apresentar' }))
    await vi.waitFor(() => expect(presentation.listDisplays.mock.calls.length).toBeGreaterThan(listed))
  })

  it('moves the open presentation only when another display is chosen', async () => {
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await screen.findByRole('option', { name: 'Ecrã 3 — 1920×1080' })
    await user.click(screen.getByRole('button', { name: 'Apresentar' }))
    await screen.findByRole('button', { name: 'Fechar apresentação' })
    expect(screen.queryByRole('button', { name: 'Apresentar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mover para este ecrã' })).not.toBeInTheDocument()

    await user.selectOptions(picker(), 'Ecrã 3 — 1920×1080')
    await user.click(screen.getByRole('button', { name: 'Mover para este ecrã' }))
    expect(presentation.open).toHaveBeenLastCalledWith(TV)
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mover para este ecrã' })).not.toBeInTheDocument())
  })

  it('closes the presentation and drops the TV controls once the window is gone', async () => {
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await user.click(await screen.findByRole('button', { name: 'Apresentar' }))
    await user.click(await screen.findByRole('button', { name: 'Fechar apresentação' }))
    expect(presentation.close).toHaveBeenCalledTimes(1)

    act(() => presentation.signals.listener!({ type: 'closed' }))
    expect(screen.queryByRole('button', { name: 'Fechar apresentação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Saltar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apresentar' })).toBeVisible()
  })

  it('warns, without blocking, that the chosen display is no longer connected', async () => {
    const missing = { code: 'display_missing', message: 'O ecrã escolhido já não está ligado. Escolha outro.' }
    const presentation = { ...fakePresentation(), open: vi.fn(() => Promise.reject(missing)) }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = renderOperator('#/operator', { presentation })
    await user.click(await screen.findByRole('button', { name: 'Apresentar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(missing.message)
    expect(screen.getByRole('button', { name: 'Apresentar' })).toBeEnabled()
    log.mockRestore()
  })
})
