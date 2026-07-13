/**
 * A short synthesized "time's up" buzzer via the Web Audio API — no bundled
 * asset, works offline. Two square-wave blips. One shared AudioContext is
 * created lazily and resumed on play; a live match always follows the staff
 * "Start" tap (a user gesture), so the context is unlockable by the time this
 * runs. No-ops where AudioContext is unavailable (jsdom / SSR).
 *
 * Known limitation: a second device watching a match it did not start may stay
 * silent until its first user interaction (browser autoplay policy).
 */

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as typeof window & { webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  const Ctor = getAudioContextCtor()
  if (Ctor === null) return null
  if (ctx === null) ctx = new Ctor()
  return ctx
}

/** One 0.15s square-wave blip at `freq`, starting `at` seconds into the context clock. */
function blip(context: AudioContext, freq: number, at: number): void {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'square'
  osc.frequency.value = freq
  // Short attack/decay envelope so the blip doesn't click.
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.2, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15)
  osc.connect(gain).connect(context.destination)
  osc.start(at)
  osc.stop(at + 0.15)
}

export function playEndBeep(): void {
  const context = getContext()
  if (context === null) return
  if (context.state === 'suspended') void context.resume()

  const now = context.currentTime
  blip(context, 880, now)
  blip(context, 660, now + 0.2)
}
