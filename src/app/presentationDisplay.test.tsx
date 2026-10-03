import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PresentationDisplay, PresentationSignal } from '../platform/presentationPort'
import { deferred, fakeRepository, fourPlayerState, renderOperator, renderSession } from './testSupport'

const REMEMBERED_KEY = 'picanha.presentationDisplay'
const ONE = String.raw`\\.\DISPLAY1`
const TWO = String.raw`\\.\DISPLAY2`
const TV = String.raw`\\.\DISPLAY3`
const display = (id: string, label: string, width: number, height: number, primary = false): PresentationDisplay =>
  ({ id, label, width, height, x: 0, y: 0, primary, scaleFactor: 1 })
/** The user's desk: a portrait side monitor, the wide main screen, and the TV. */
const DISPLAYS = [
  display(ONE, 'Ecrã 1', 1080, 1920),
  display(TWO, 'Ecrã 2', 3440, 1440, true),
  display(TV, 'Ecrã 3', 1920, 1080),
]
const missing = { code: 'display_missing', message: 'O ecrã escolhido já não está ligado. Escolha outro.' }

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
    publish: vi.fn(async () => {}),
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
const presentButton = async () => {
  const button = await screen.findByRole('button', { name: 'Apresentar' })
  await vi.waitFor(() => expect(button).toBeEnabled())
  return button
}

describe('choosing the presentation display', () => {
  it('lists the displays and starts on the largest landscape one that is not the main screen', async () => {
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await screen.findByRole('option', { name: 'Ecrã 3 — 1920×1080' })
    expect(optionNames()).toEqual([
      'Ecrã 1 — 1080×1920', 'Ecrã 2 — 3440×1440 (principal)', 'Ecrã 3 — 1920×1080', 'Janela (neste ecrã)',
    ])
    expect(picker()).toHaveValue(TV)

    await user.click(await presentButton())
    expect(presentation.open).toHaveBeenCalledWith(TV)
  })

  it('falls back to a portrait secondary display', async () => {
    renderOperator('#/operator', { presentation: fakePresentation(DISPLAYS.slice(0, 2)) })
    await vi.waitFor(() => expect(picker()).toHaveValue(ONE))
  })

  it('keeps Apresentar disabled until the displays are known', async () => {
    const listed = deferred<PresentationDisplay[]>()
    const presentation = { ...fakePresentation(), listDisplays: vi.fn(() => listed.promise) }
    renderOperator('#/operator', { presentation })
    expect(await screen.findByRole('button', { name: 'Apresentar' })).toBeDisabled()
    await act(async () => listed.resolve(DISPLAYS))
    expect(screen.getByRole('button', { name: 'Apresentar' })).toBeEnabled()
    expect(picker()).toHaveValue(TV)
  })

  it('remembers a display once the presentation opened there', async () => {
    localStorage.setItem(REMEMBERED_KEY, ONE)
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await vi.waitFor(() => expect(picker()).toHaveValue(ONE))

    await user.selectOptions(picker(), 'Janela (neste ecrã)')
    expect(localStorage.getItem(REMEMBERED_KEY)).toBe(ONE)
    await user.click(await presentButton())
    expect(presentation.open).toHaveBeenCalledWith('window')
    await vi.waitFor(() => expect(localStorage.getItem(REMEMBERED_KEY)).toBe('window'))
  })

  it('does not remember a display the presentation failed to open on', async () => {
    const presentation = { ...fakePresentation(), open: vi.fn(() => Promise.reject(missing)) }
    const { user } = renderOperator('#/operator', { presentation })
    await screen.findByRole('option', { name: 'Ecrã 3 — 1920×1080' })
    await user.click(await presentButton())
    await screen.findByRole('alert')
    expect(localStorage.getItem(REMEMBERED_KEY)).toBeNull()
  })

  it('ignores a remembered display that is no longer connected', async () => {
    localStorage.setItem(REMEMBERED_KEY, String.raw`\\.\DISPLAY9`)
    renderOperator('#/operator', { presentation: fakePresentation() })
    await vi.waitFor(() => expect(picker()).toHaveValue(TV))
  })

  it('offers a window only, outside the app or with a single screen', async () => {
    renderOperator('#/operator', { presentation: { ...fakePresentation(), listDisplays: undefined } })
    await presentButton()
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
    await user.click(await presentButton())
    await vi.waitFor(() => expect(presentation.listDisplays.mock.calls.length).toBeGreaterThan(listed))
  })

  it('keeps only the newest list when refreshes answer out of order', async () => {
    const slow = deferred<PresentationDisplay[]>()
    const presentation = fakePresentation()
    presentation.listDisplays.mockReturnValueOnce(slow.promise)
    renderOperator('#/operator', { presentation })
    act(() => picker().focus())
    await screen.findByRole('option', { name: 'Ecrã 3 — 1920×1080' })
    await act(async () => slow.resolve([DISPLAYS[1]]))
    expect(optionNames()).toHaveLength(4)
  })

  it('moves the open presentation only when another display is chosen', async () => {
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await screen.findByRole('option', { name: 'Ecrã 3 — 1920×1080' })
    await user.click(await presentButton())
    await screen.findByRole('button', { name: 'Fechar apresentação' })
    expect(screen.queryByRole('button', { name: 'Apresentar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mover para este ecrã' })).not.toBeInTheDocument()

    await user.selectOptions(picker(), 'Ecrã 1 — 1080×1920')
    await user.click(screen.getByRole('button', { name: 'Mover para este ecrã' }))
    expect(presentation.open).toHaveBeenLastCalledWith(ONE)
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mover para este ecrã' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Saltar' })).toHaveFocus()
    expect(localStorage.getItem(REMEMBERED_KEY)).toBe(ONE)
  })

  it('closes the presentation and drops the TV controls once the window is gone', async () => {
    const presentation = fakePresentation()
    const { user } = renderOperator('#/operator', { presentation })
    await user.click(await presentButton())
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Saltar' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Fechar apresentação' }))
    expect(presentation.close).toHaveBeenCalledTimes(1)

    act(() => presentation.signals.listener!({ type: 'closed' }))
    expect(screen.queryByRole('button', { name: 'Fechar apresentação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Saltar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apresentar' })).toHaveFocus()
  })

  it('stays quiet about updates once the presentation is being closed', async () => {
    const presentation = { ...fakePresentation(), publish: vi.fn(() => Promise.reject(new Error('fechada'))) }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = renderSession(fakeRepository(), fourPlayerState(), { presentation })
    await vi.waitFor(() => expect(session.current?.loading).toBe(false))
    await act(() => session.current!.openPresentation(TV))
    await act(() => session.current!.closePresentation())
    const match = session.current!.state!.groups[0].matches[0]
    act(() => session.current!.recordResult({
      matchId: match.id, winnerId: match.player1Id, loserBallsRemaining: 2, kind: 'played',
    }))
    await vi.waitFor(() => expect(presentation.publish).toHaveBeenCalled())
    await act(async () => {})
    expect(session.current!.notice).toBeNull()
    log.mockRestore()
  })

  it('warns, without blocking or logging, that the chosen display is no longer connected', async () => {
    const presentation = { ...fakePresentation(), open: vi.fn(() => Promise.reject(missing)) }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = renderOperator('#/operator', { presentation })
    await user.click(await presentButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(missing.message)
    expect(screen.getByRole('button', { name: 'Apresentar' })).toBeEnabled()
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
