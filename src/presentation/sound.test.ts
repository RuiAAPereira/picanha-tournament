import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRevealSound, SOUND_VOLUME } from './sound'

class FakeParam {
  value = 1
  setValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
}
class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()
  type = 'sine'
  connect = vi.fn(() => this)
  start = vi.fn()
  stop = vi.fn()
}
const contexts: FakeContext[] = []
class FakeContext {
  currentTime = 0
  state = 'running'
  destination = {}
  gains: FakeNode[] = []
  oscillators: FakeNode[] = []
  constructor() {
    contexts.push(this)
  }
  createGain() {
    const node = new FakeNode()
    this.gains.push(node)
    return node
  }
  createOscillator() {
    const node = new FakeNode()
    this.oscillators.push(node)
    return node
  }
  resume = vi.fn(async () => {})
}

afterEach(() => {
  vi.unstubAllGlobals()
  contexts.length = 0
})

describe('createRevealSound', () => {
  it('starts unmuted at 40% volume and mutes through the master gain', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    const sound = createRevealSound()
    sound.play()
    const master = contexts[0].gains[0]
    expect(SOUND_VOLUME).toBe(0.4)
    expect(master.gain.value).toBe(0.4)
    expect(contexts[0].oscillators.length).toBeGreaterThan(0)

    sound.setMuted(true)
    expect(master.gain.value).toBe(0)
    sound.setMuted(false)
    expect(master.gain.value).toBe(0.4)
  })

  it('stays silent without playing anything while muted', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    const sound = createRevealSound()
    sound.setMuted(true)
    sound.play()
    expect(contexts.every(context => context.oscillators.length === 0)).toBe(true)
  })

  it('never throws where Web Audio is missing', () => {
    vi.stubGlobal('AudioContext', undefined)
    const sound = createRevealSound()
    expect(() => {
      sound.play()
      sound.setMuted(true)
      sound.close()
    }).not.toThrow()
  })
})
