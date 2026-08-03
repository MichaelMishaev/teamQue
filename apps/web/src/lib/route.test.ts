import { describe, expect, it } from 'vitest'
import { parseRoute, publicLineUrl } from './route'

describe('parseRoute', () => {
  it('/ is home', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' })
  })
  it('/f/<slug> is a field', () => {
    expect(parseRoute('/f/abc234')).toEqual({ kind: 'field', slug: 'abc234' })
  })
  it('/line is the public read-only Independence Square line', () => {
    expect(parseRoute('/line')).toEqual({ kind: 'line' })
  })
  it('/line/:slug is one stable public read-only field queue', () => {
    expect(parseRoute('/line/abc234')).toEqual({ kind: 'line', slug: 'abc234' })
    expect(parseRoute('/line/abc234', 'line.maple-group.info')).toEqual({ kind: 'line', slug: 'abc234' })
    expect(publicLineUrl('abc234')).toBe('https://line.maple-group.info/line/abc234')
  })
  it('junk falls back to home', () => {
    expect(parseRoute('/f/UPPER!')).toEqual({ kind: 'home' })
    expect(parseRoute('/f/')).toEqual({ kind: 'home' })
    expect(parseRoute('/anything/else')).toEqual({ kind: 'home' })
  })
  it('every path on the public QR host is the read-only line (SW-cached loads included)', () => {
    expect(parseRoute('/', 'line.maple-group.info')).toEqual({ kind: 'line' })
    expect(parseRoute('/line', 'line.maple-group.info')).toEqual({ kind: 'line' })
    expect(parseRoute('/line/abc234', 'line.maple-group.info')).toEqual({ kind: 'line', slug: 'abc234' })
    expect(parseRoute('/f/abc234', 'line.maple-group.info')).toEqual({ kind: 'line' })
    expect(parseRoute('/anything/else', 'line.maple-group.info')).toEqual({ kind: 'line' })
  })
  it('the staff host is unaffected by the hostname rule', () => {
    expect(parseRoute('/', 'gate.netanya.club')).toEqual({ kind: 'home' })
    expect(parseRoute('/f/abc234', 'gate.netanya.club')).toEqual({ kind: 'field', slug: 'abc234' })
  })
})
