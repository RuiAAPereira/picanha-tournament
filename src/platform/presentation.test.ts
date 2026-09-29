import { describe, expect, it, vi } from 'vitest'
import { fourPlayerState } from '../app/testSupport'
import type { PresentationState } from '../presentation/presentationState'
import { projectPresentation } from '../presentation/projection'
import { createTauriPresentationController, fetchPresentationSnapshot, GENERIC_PRESENTATION_ERROR_MESSAGE } from './presentation'

const idle: PresentationState = { kind: 'idle', tournamentName: 'Torneio', payload: null }
const closed = { code: 'window_closed', message: 'A janela da apresentação está fechada.' }

describe('createTauriPresentationController', () => {
  it('opens the presentation window', async () => {
    const invoke = vi.fn(async () => null)
    const controller = createTauriPresentationController(invoke)
    await controller.open()
    expect(invoke).toHaveBeenCalledWith('open_presentation_window')
  })

  it('publishes a presentation state as is', async () => {
    const invoke = vi.fn(async () => null)
    await createTauriPresentationController(invoke).publish(idle)
    expect(invoke).toHaveBeenCalledWith('publish_presentation_state', { state: idle })
  })

  it('projects a tournament state and its event before publishing', async () => {
    const invoke = vi.fn(async () => null)
    const state = fourPlayerState()
    await createTauriPresentationController(invoke).publish(state, { type: 'draw' })
    expect(invoke).toHaveBeenCalledWith('publish_presentation_state', { state: projectPresentation(state, { type: 'draw' }) })
  })

  it('skips the reveal and sets the sound', async () => {
    const invoke = vi.fn(async () => null)
    const controller = createTauriPresentationController(invoke)
    await controller.skip()
    await controller.setMuted(true)
    expect(invoke).toHaveBeenNthCalledWith(1, 'skip_presentation')
    expect(invoke).toHaveBeenNthCalledWith(2, 'set_presentation_muted', { muted: true })
  })

  it('passes presentation errors through and asks for a new window on the next open', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'publish_presentation_state') throw closed
      return null
    })
    const controller = createTauriPresentationController(invoke)
    await controller.open()
    await expect(controller.publish(idle)).rejects.toEqual(closed)
    await controller.open()
    expect(invoke.mock.calls.filter(([command]) => command === 'open_presentation_window')).toHaveLength(2)
  })

  it('turns unknown failures into a generic Portuguese error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const controller = createTauriPresentationController(vi.fn(async () => { throw new Error('ipc down') }))
    await expect(controller.open()).rejects.toEqual({ code: 'unexpected', message: GENERIC_PRESENTATION_ERROR_MESSAGE })
    log.mockRestore()
  })
})

describe('fetchPresentationSnapshot', () => {
  it('reads the last published state and sound setting', async () => {
    const invoke = vi.fn(async () => ({ state: idle, muted: true }))
    expect(await fetchPresentationSnapshot(invoke)).toEqual({ state: idle, muted: true })
    expect(invoke).toHaveBeenCalledWith('get_presentation_state')
  })
})
