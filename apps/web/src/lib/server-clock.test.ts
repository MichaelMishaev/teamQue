import { describe, expect, it } from 'vitest'
import { computeOffsetMs, serverNowMs } from './server-clock'

describe('computeOffsetMs', () => {
  it('is zero when server and client clocks agree', () => {
    const clientNowMs = Date.UTC(2026, 6, 10, 19, 0, 0)
    expect(computeOffsetMs(new Date(clientNowMs).toISOString(), clientNowMs)).toBe(0)
  })

  it('is positive when the server clock is ahead of the client', () => {
    const clientNowMs = Date.UTC(2026, 6, 10, 19, 0, 0)
    const serverNowIso = new Date(clientNowMs + 5000).toISOString()
    expect(computeOffsetMs(serverNowIso, clientNowMs)).toBe(5000)
  })

  it('is negative when the server clock is behind the client', () => {
    const clientNowMs = Date.UTC(2026, 6, 10, 19, 0, 0)
    const serverNowIso = new Date(clientNowMs - 3000).toISOString()
    expect(computeOffsetMs(serverNowIso, clientNowMs)).toBe(-3000)
  })
})

describe('serverNowMs', () => {
  it('adds the offset back onto a client timestamp', () => {
    expect(serverNowMs(5000, 1000)).toBe(6000)
    expect(serverNowMs(-3000, 10000)).toBe(7000)
    expect(serverNowMs(0, 42)).toBe(42)
  })

  it('round-trips with computeOffsetMs', () => {
    const clientNowMs = Date.UTC(2026, 6, 10, 19, 0, 0)
    const serverNowIso = '2026-07-10T19:00:07.000Z'
    const offsetMs = computeOffsetMs(serverNowIso, clientNowMs)
    expect(serverNowMs(offsetMs, clientNowMs)).toBe(new Date(serverNowIso).getTime())
  })
})
