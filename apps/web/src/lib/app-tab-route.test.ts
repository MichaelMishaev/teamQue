import { describe, expect, it } from 'vitest'
import { APP_TABS, appTabHref, isManagedTabState, managedTabState, parseAppTab } from './app-tab-route'

describe('parseAppTab', () => {
  it('defaults to Main when the tab parameter is absent', () => {
    expect(parseAppTab('')).toBe('main')
    expect(parseAppTab('?filter=recent')).toBe('main')
  })

  it.each(APP_TABS.filter((tab) => tab !== 'main'))('parses the supported %s destination', (tab) => {
    expect(parseAppTab(`?tab=${tab}`)).toBe(tab)
  })

  it.each(['main', '', 'unknown'])('fails safely to Main for tab=%s', (tab) => {
    expect(parseAppTab(`?tab=${tab}`)).toBe('main')
  })

  it('fails safely to Main when tab is duplicated', () => {
    expect(parseAppTab('?tab=history&tab=settings')).toBe('main')
  })
})

describe('appTabHref', () => {
  it('removes only tab for Main and preserves other query parameters and the hash', () => {
    expect(appTabHref('https://queue.test/f/abc234?filter=recent&tab=history#queue', 'main')).toBe(
      '/f/abc234?filter=recent#queue',
    )
  })

  it('adds a secondary tab without changing the pathname, other query parameters, or hash', () => {
    expect(appTabHref('https://queue.test/f/abc234?filter=recent#queue', 'activity')).toBe(
      '/f/abc234?filter=recent&tab=activity#queue',
    )
  })

  it('replaces duplicate tab parameters with one canonical value', () => {
    expect(appTabHref('https://queue.test/f/abc234?tab=history&tab=activity&filter=recent', 'settings')).toBe(
      '/f/abc234?tab=settings&filter=recent',
    )
  })
})

describe('managed tab history state', () => {
  it('creates and recognizes a managed secondary destination', () => {
    const state = managedTabState('history')
    expect(state).toEqual({ kind: 'qlm-tab', tab: 'history' })
    expect(isManagedTabState(state)).toBe(true)
  })

  it.each([
    null,
    [],
    { kind: 'other', tab: 'history' },
    { kind: 'qlm-tab', tab: 'main' },
    { kind: 'qlm-tab', tab: 'unknown' },
    { tab: 'history' },
  ])('rejects unmanaged state %#', (state) => {
    expect(isManagedTabState(state)).toBe(false)
  })
})
