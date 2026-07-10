/**
 * Server-clock offset math (technical-prd §4/§5). The client never trusts its
 * own clock for timers: it computes an offset once from the socket handshake
 * (or a snapshot's serverNow) and applies it to every local "now" read.
 */

/** offsetMs = server time − client time, both in epoch ms. */
export function computeOffsetMs(serverNowIso: string, clientNowMs: number): number {
  return new Date(serverNowIso).getTime() - clientNowMs
}

/** Reapply a previously computed offset to a fresh client timestamp. */
export function serverNowMs(offsetMs: number, clientNowMs: number): number {
  return clientNowMs + offsetMs
}
