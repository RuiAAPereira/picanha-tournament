import { vi } from 'vitest'

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

/** A context that starts `initialState`; `resume()` only runs it once `allowed` (a gesture happened). */
export function fakeAudioContext(initialState: 'running' | 'suspended') {
  const contexts: FakeContext[] = []
  const gate = { allowed: initialState === 'running' }
  class FakeContext {
    currentTime = 0
    state: string = initialState
    destination = {}
    gains: FakeNode[] = []
    oscillators: FakeNode[] = []
    private listeners: (() => void)[] = []
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
    addEventListener(_type: string, listener: () => void) {
      this.listeners.push(listener)
    }
    removeEventListener() {}
    resume = vi.fn(() => {
      // Like a webview without user activation: the promise does not settle until allowed.
      if (!gate.allowed) return new Promise<void>(() => {})
      this.state = 'running'
      this.listeners.forEach(listener => listener())
      return Promise.resolve()
    })
    close = vi.fn(async () => {})
  }
  return { FakeContext, contexts, gate }
}
