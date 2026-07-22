import { describe, expect, it } from 'vitest'
import { parseRoute } from './route'

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
  it('junk falls back to home', () => {
    expect(parseRoute('/f/UPPER!')).toEqual({ kind: 'home' })
    expect(parseRoute('/f/')).toEqual({ kind: 'home' })
    expect(parseRoute('/anything/else')).toEqual({ kind: 'home' })
  })
})
