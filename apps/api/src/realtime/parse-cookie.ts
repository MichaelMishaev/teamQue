/**
 * Minimal raw Cookie-header parser for the gateway's handshake auth
 * (SessionGateway.handleConnection reads `client.handshake.headers.cookie`,
 * which is the raw header string — no `cookie-parser` middleware runs on
 * the Socket.IO handshake). Deliberately hand-rolled rather than pulling in
 * the `cookie` package as a new dependency for one lookup.
 */
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) continue
    const key = part.slice(0, separatorIndex).trim()
    if (key !== name) continue
    const value = part.slice(separatorIndex + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return undefined
}
