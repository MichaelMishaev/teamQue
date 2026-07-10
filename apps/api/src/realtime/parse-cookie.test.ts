import { describe, expect, it } from 'vitest'
import { parseCookie } from './parse-cookie'

describe('parseCookie', () => {
  it('extracts a named cookie value from a raw Cookie header', () => {
    expect(parseCookie('qlm_center=abc; qlm_session=def', 'qlm_session')).toBe('def')
  })

  it('extracts the first cookie when it is the only one', () => {
    expect(parseCookie('qlm_session=solo', 'qlm_session')).toBe('solo')
  })

  it('returns undefined when the named cookie is absent', () => {
    expect(parseCookie('qlm_center=abc', 'qlm_session')).toBeUndefined()
  })

  it('returns undefined for an undefined header', () => {
    expect(parseCookie(undefined, 'qlm_session')).toBeUndefined()
  })

  it('decodes URI-encoded values (JWTs never need this, but cookie values in general might)', () => {
    expect(parseCookie('name=hello%20world', 'name')).toBe('hello world')
  })

  it('handles extra whitespace around cookie pairs', () => {
    expect(parseCookie('  qlm_center=abc ;  qlm_session=def  ', 'qlm_session')).toBe('def')
  })
})
