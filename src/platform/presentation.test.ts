import { describe, expect, it, vi } from 'vitest'
import { fourPlayerState, playGroups } from '../app/testSupport'
import { applyMatchResult } from '../domain/tournament'
import type { PresentationState } from '../presentation/presentationState'
import { projectPresentation } from '../presentation/projection'
import {
  createTauriPresentationController, fetchPresentationSnapshot, GENERIC_PRESENTATION_ERROR_MESSAGE, type ListenFn,
} from './presentation'

const idle: PresentationState = { kind: 'idle', tournamentName: 'Torneio', payload: null }
const champion: PresentationState = { kind: 'champion', tournamentName: 'Torneio', payload: { champion: 'Ana', runnerUp: 'Rui' } }
const TV_ID = String.raw`\\.\DISPLAY3`
const closed = { code: 'window_closed', message: 'A janela da apresentação está fechada.' }

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>
const noListen: ListenFn = async () => () => {}
const controllerWith = (invoke: Invoke, clock = () => 100) => createTauriPresentationController(invoke, noListen, clock)
const fakeInvoke = () => vi.fn<Invoke>(async () => null)
const updates = (invoke: ReturnType<typeof fakeInvoke>) =>
  invoke.mock.calls.filter(([command]) => command === 'publish_presentation_state').map(([, args]) => args!.update)

describe('createTauriPresentationController', () => {
  it('opens the presentation window on the chosen display, or where the app decides', async () => {
    const invoke = fakeInvoke()
    const controller = controllerWith(invoke)
    await controller.open(TV_ID)
    await controller.open('window')
    await controller.open()
    expect(invoke.mock.calls).toEqual([
      ['open_presentation_window', { display: TV_ID }],
      ['open_presentation_window', { display: 'window' }],
      ['open_presentation_window', { display: null }],
    ])
  })

  it('lists the connected displays', async () => {
    const tv = { id: TV_ID, label: 'Ecrã 3', width: 1920, height: 1080, x: 3440, y: 0, primary: false, scaleFactor: 1 }
    const invoke = vi.fn<Invoke>(async () => [tv])
    expect(await controllerWith(invoke).listDisplays()).toEqual([tv])
    expect(invoke).toHaveBeenCalledWith('list_presentation_displays')
  })

  it('closes the presentation window', async () => {
    const invoke = fakeInvoke()
    await controllerWith(invoke).close()
    expect(invoke).toHaveBeenCalledWith('close_presentation_window')
  })

  it('passes a missing display through as it is', async () => {
    const missing = { code: 'display_missing', message: 'O ecrã escolhido já não está ligado. Escolha outro.' }
    const controller = controllerWith(vi.fn<Invoke>(async () => { throw missing }))
    await expect(controller.open('gone')).rejects.toEqual(missing)
  })

  it('publishes a TV state with a reveal, and idle states without one', async () => {
    const invoke = fakeInvoke()
    const controller = controllerWith(invoke)
    await controller.publishPresentation(champion)
    await controller.publishPresentation(idle)
    await controller.publishPresentation(champion, { reveal: false })
    expect(updates(invoke)).toEqual([
      { seq: 100, reveal: true, state: champion },
      { seq: 101, reveal: false, state: idle },
      { seq: 102, reveal: false, state: champion },
    ])
  })

  it('numbers publishes from the clock, always increasing', async () => {
    const invoke = fakeInvoke()
    const times = [500, 400, 900]
    const controller = controllerWith(invoke, () => times.shift()!)
    for (let index = 0; index < 3; index++) await controller.publishPresentation(champion)
    expect(updates(invoke).map(update => (update as { seq: number }).seq)).toEqual([500, 501, 900])
  })

  it('projects a tournament state and its event before publishing', async () => {
    const invoke = fakeInvoke()
    const state = fourPlayerState()
    await controllerWith(invoke).publish(state, { type: 'draw' })
    expect(updates(invoke)).toEqual([{ seq: 100, reveal: true, state: projectPresentation(state, { type: 'draw' }) }])
  })

  it('seeds a resumed tournament without a reveal, as its champion when the final is decided', async () => {
    const invoke = fakeInvoke()
    const controller = controllerWith(invoke)
    const groupsDone = playGroups(fourPlayerState(), ['ana', 'bruno', 'carla', 'duarte'])
    const finished = applyMatchResult(groupsDone, {
      matchId: groupsDone.bracket.rounds.at(-1)!.matches[0].id, winnerId: 'ana', loserBallsRemaining: 0, at: 'x',
    })
    await controller.seed(fourPlayerState())
    await controller.seed(finished)
    expect(updates(invoke)).toEqual([
      { seq: 100, reveal: false, state: expect.objectContaining({ kind: 'next' }) },
      { seq: 101, reveal: false, state: { kind: 'champion', tournamentName: 'Torneio', payload: { champion: 'Ana', runnerUp: 'Bruno' } } },
    ])
  })

  it('skips the reveal, sets and reads the sound', async () => {
    const invoke = vi.fn<Invoke>(async command => command === 'get_presentation_state' ? { update: null, muted: true } : null)
    const controller = controllerWith(invoke)
    await controller.skip()
    await controller.setMuted(true)
    expect(await controller.readMuted()).toBe(true)
    expect(invoke).toHaveBeenNthCalledWith(1, 'skip_presentation')
    expect(invoke).toHaveBeenNthCalledWith(2, 'set_presentation_muted', { muted: true })
  })

  it('passes the sound and closing of the TV on to the operator', async () => {
    const handlers = new Map<string, (message: { payload: unknown }) => void>()
    const unlisten = vi.fn()
    const listen: ListenFn = async (event, handler) => {
      handlers.set(event, handler)
      return unlisten
    }
    const controller = createTauriPresentationController(fakeInvoke(), listen)
    const listener = vi.fn()
    const stop = controller.subscribe(listener)
    await vi.waitFor(() => expect(handlers.size).toBe(2))
    handlers.get('presentation-muted')!({ payload: true })
    handlers.get('presentation-closed')!({ payload: null })
    expect(listener.mock.calls).toEqual([[{ type: 'muted', muted: true }], [{ type: 'closed' }]])
    stop()
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(2))
  })

  it('passes presentation errors through and asks for a new window on the next open', async () => {
    const invoke = vi.fn<Invoke>(async command => {
      if (command === 'publish_presentation_state') throw closed
      return null
    })
    const controller = controllerWith(invoke)
    await controller.open()
    await expect(controller.publishPresentation(idle)).rejects.toEqual(closed)
    await controller.open()
    expect(invoke.mock.calls.filter(([command]) => command === 'open_presentation_window')).toHaveLength(2)
  })

  it('turns unknown failures into a generic Portuguese error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const controller = controllerWith(vi.fn<Invoke>(async () => { throw new Error('ipc down') }))
    await expect(controller.open()).rejects.toEqual({ code: 'unexpected', message: GENERIC_PRESENTATION_ERROR_MESSAGE })
    log.mockRestore()
  })
})

describe('fetchPresentationSnapshot', () => {
  it('reads the newest update and sound setting', async () => {
    const snapshot = { update: { seq: 1, reveal: true, state: idle }, muted: true }
    const invoke = vi.fn<Invoke>(async () => snapshot)
    expect(await fetchPresentationSnapshot(invoke)).toEqual(snapshot)
    expect(invoke).toHaveBeenCalledWith('get_presentation_state')
  })
})
