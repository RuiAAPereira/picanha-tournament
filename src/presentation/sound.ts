/** Master volume of the reveal cue; muting drops it to zero. */
export const SOUND_VOLUME = 0.4

/** A rising three-note chime, in Hz. */
const NOTES = [523.25, 659.25, 783.99]
const NOTE_GAP = 0.12
const NOTE_LENGTH = 0.5

export type RevealSound = {
  play(): void
  setMuted(muted: boolean): void
  close(): void
}

type AudioContextClass = typeof AudioContext

/**
 * A short synthesized cue for reveals (no audio files). Web Audio is created on first use and every
 * failure is swallowed: a missing or blocked sound never affects the presentation.
 */
export function createRevealSound(): RevealSound {
  let muted = false
  let context: AudioContext | null = null
  let master: GainNode | null = null

  function ensureContext() {
    if (context) return context
    const Context = (globalThis as { AudioContext?: AudioContextClass }).AudioContext
    if (!Context) return null
    context = new Context()
    master = context.createGain()
    master.gain.value = muted ? 0 : SOUND_VOLUME
    master.connect(context.destination)
    return context
  }

  return {
    play() {
      if (muted) return
      try {
        const audio = ensureContext()
        if (!audio || !master) return
        // Best effort: the webview may keep audio suspended until the first click on the TV window.
        if (audio.state === 'suspended') void audio.resume().catch(() => {})
        NOTES.forEach((frequency, index) => {
          const start = audio.currentTime + index * NOTE_GAP
          const oscillator = audio.createOscillator()
          const envelope = audio.createGain()
          oscillator.type = 'triangle'
          oscillator.frequency.value = frequency
          envelope.gain.setValueAtTime(0.0001, start)
          envelope.gain.exponentialRampToValueAtTime(1, start + 0.02)
          envelope.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_LENGTH)
          oscillator.connect(envelope).connect(master!)
          oscillator.start(start)
          oscillator.stop(start + NOTE_LENGTH)
        })
      } catch (error) {
        console.error('[sound]', error)
      }
    },
    setMuted(next) {
      muted = next
      if (master) master.gain.value = next ? 0 : SOUND_VOLUME
    },
    close() {
      void context?.close?.().catch(() => {})
      context = null
      master = null
    },
  }
}
