/** Master volume of the reveal cue; muting drops it to zero. */
export const SOUND_VOLUME = 0.4

/** A rising three-note chime, in Hz. */
const NOTES = [523.25, 659.25, 783.99]
const NOTE_GAP = 0.12
const NOTE_LENGTH = 0.5
/** How long a reveal waits for a suspended context to resume before dropping its cue. */
const RESUME_WAIT_MS = 50

export type RevealSound = {
  /** Creates the audio context, so `needsGesture` can tell whether the webview holds sound back. */
  prepare(): void
  /** Plays the cue now, or not at all: a cue is never queued for later. */
  play(): Promise<void>
  /** Called on a click or key press in the TV window: lets a suspended context run. */
  unlock(): Promise<void>
  setMuted(muted: boolean): void
  /** True while the webview keeps sound suspended until someone interacts with the TV window. */
  needsGesture(): boolean
  /** Called whenever `needsGesture` may have changed; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
  close(): void
}

type AudioContextClass = typeof AudioContext

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A short synthesized cue for reveals (no audio files). Every failure is swallowed: a missing or
 * blocked sound never affects the presentation.
 */
export function createRevealSound(): RevealSound {
  let muted = false
  let context: AudioContext | null = null
  let master: GainNode | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())

  function ensureContext() {
    if (context) return context
    const Context = (globalThis as { AudioContext?: AudioContextClass }).AudioContext
    if (!Context) return null
    try {
      context = new Context()
      master = context.createGain()
      master.gain.value = muted ? 0 : SOUND_VOLUME
      master.connect(context.destination)
      context.addEventListener?.('statechange', notify)
    } catch (error) {
      console.error('[sound]', error)
      context = null
      master = null
    }
    return context
  }

  async function resume(audio: AudioContext, waitMs?: number) {
    const resumed = audio.resume().catch(() => {})
    await (waitMs === undefined ? resumed : Promise.race([resumed, wait(waitMs)]))
    notify()
  }

  function schedule(audio: AudioContext, output: GainNode) {
    NOTES.forEach((frequency, index) => {
      const start = audio.currentTime + index * NOTE_GAP
      const oscillator = audio.createOscillator()
      const envelope = audio.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.value = frequency
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(1, start + 0.02)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_LENGTH)
      oscillator.connect(envelope).connect(output)
      oscillator.start(start)
      oscillator.stop(start + NOTE_LENGTH)
    })
  }

  return {
    prepare() {
      ensureContext()
      notify()
    },
    async play() {
      if (muted) return
      try {
        const audio = ensureContext()
        if (!audio || !master) return
        if (audio.state !== 'running') await resume(audio, RESUME_WAIT_MS)
        // Still held back (no click on the TV yet), muted meanwhile, or closed: drop this cue.
        if (audio.state !== 'running' || muted || audio !== context) return
        schedule(audio, master)
      } catch (error) {
        console.error('[sound]', error)
      }
    },
    async unlock() {
      const audio = ensureContext()
      if (audio && audio.state !== 'running') await resume(audio)
    },
    setMuted(next) {
      muted = next
      if (master) master.gain.value = next ? 0 : SOUND_VOLUME
    },
    needsGesture: () => context?.state === 'suspended',
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      context?.removeEventListener?.('statechange', notify)
      void context?.close?.().catch(() => {})
      context = null
      master = null
    },
  }
}
