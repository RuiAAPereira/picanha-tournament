import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeAudioContext } from '../test/fakeAudioContext'
import { createRevealSound, SOUND_VOLUME } from './sound'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRevealSound', () => {
  it('starts unmuted at 40% volume and mutes through the master gain', async () => {
    const audio = fakeAudioContext('running')
    vi.stubGlobal('AudioContext', audio.FakeContext)
    const sound = createRevealSound()
    await sound.play()
    const master = audio.contexts[0].gains[0]
    expect(SOUND_VOLUME).toBe(0.4)
    expect(master.gain.value).toBe(0.4)
    expect(audio.contexts[0].oscillators).toHaveLength(3)

    sound.setMuted(true)
    expect(master.gain.value).toBe(0)
    sound.setMuted(false)
    expect(master.gain.value).toBe(0.4)
  })

  it('stays silent without playing anything while muted', async () => {
    const audio = fakeAudioContext('running')
    vi.stubGlobal('AudioContext', audio.FakeContext)
    const sound = createRevealSound()
    sound.setMuted(true)
    await sound.play()
    expect(audio.contexts.every(context => context.oscillators.length === 0)).toBe(true)
  })

  it('drops the cue while the webview holds sound back, and plays once after a gesture', async () => {
    const audio = fakeAudioContext('suspended')
    vi.stubGlobal('AudioContext', audio.FakeContext)
    const sound = createRevealSound()
    const changed = vi.fn()
    sound.subscribe(changed)
    sound.prepare()
    expect(sound.needsGesture()).toBe(true)

    await sound.play()
    expect(audio.contexts[0].oscillators).toHaveLength(0)

    audio.gate.allowed = true
    await sound.unlock()
    expect(sound.needsGesture()).toBe(false)
    expect(changed).toHaveBeenCalled()
    // The dropped cue never plays late.
    expect(audio.contexts[0].oscillators).toHaveLength(0)
    await sound.play()
    expect(audio.contexts[0].oscillators).toHaveLength(3)
  })

  it('never throws where Web Audio is missing', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const sound = createRevealSound()
    sound.prepare()
    await sound.play()
    await sound.unlock()
    expect(sound.needsGesture()).toBe(false)
    expect(() => {
      sound.setMuted(true)
      sound.close()
    }).not.toThrow()
  })
})
