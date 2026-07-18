import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppTabNavigation } from './useAppTabNavigation'

describe('useAppTabNavigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/f/abc234')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('initializes Main from the canonical field URL', () => {
    const { result } = renderHook(() => useAppTabNavigation())
    expect(result.current.tab).toBe('main')
    expect(result.current.hrefFor('history')).toBe('/f/abc234?tab=history')
  })

  it('pushes one managed entry when leaving Main for a secondary destination', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => useAppTabNavigation())

    act(() => result.current.selectTab('history'))

    expect(result.current.tab).toBe('history')
    expect(window.location.pathname + window.location.search).toBe('/f/abc234?tab=history')
    expect(pushState).toHaveBeenCalledWith({ kind: 'qlm-tab', tab: 'history' }, '', '/f/abc234?tab=history')
  })

  it('replaces the managed entry when switching between secondary destinations', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useAppTabNavigation())

    act(() => result.current.selectTab('activity'))
    act(() => result.current.selectTab('settings'))

    expect(result.current.tab).toBe('settings')
    expect(window.history.state).toEqual({ kind: 'qlm-tab', tab: 'settings' })
    expect(replaceState).toHaveBeenLastCalledWith({ kind: 'qlm-tab', tab: 'settings' }, '', '/f/abc234?tab=settings')
  })

  it('selects Main when popstate returns to the canonical field URL', () => {
    const { result } = renderHook(() => useAppTabNavigation())
    act(() => result.current.selectTab('history'))

    act(() => {
      window.history.replaceState(null, '', '/f/abc234')
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })

    expect(result.current.tab).toBe('main')
  })

  it('restores the secondary destination when Forward emits popstate', () => {
    const { result } = renderHook(() => useAppTabNavigation())

    act(() => {
      window.history.replaceState({ kind: 'qlm-tab', tab: 'settings' }, '', '/f/abc234?tab=settings')
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
    })

    expect(result.current.tab).toBe('settings')
  })

  it('uses history.back when Main is selected from an app-managed secondary entry', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const { result } = renderHook(() => useAppTabNavigation())
    act(() => result.current.selectTab('history'))

    act(() => result.current.selectTab('main'))

    expect(back).toHaveBeenCalledOnce()
    expect(result.current.tab).toBe('history')
  })

  it('issues only one Back while a managed return to Main is pending', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const { result } = renderHook(() => useAppTabNavigation())
    act(() => result.current.selectTab('history'))

    act(() => {
      result.current.selectTab('main')
      result.current.selectTab('main')
    })

    expect(back).toHaveBeenCalledOnce()
  })

  it('canonicalizes an unmanaged direct secondary URL instead of navigating outside the field', () => {
    window.history.replaceState({ source: 'direct' }, '', '/f/abc234?tab=history')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useAppTabNavigation())

    act(() => result.current.selectTab('main'))

    expect(back).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledWith({ source: 'direct' }, '', '/f/abc234')
    expect(result.current.tab).toBe('main')
  })

  it('keeps a direct secondary entry unmanaged when switching destinations', () => {
    window.history.replaceState({ source: 'direct' }, '', '/f/abc234?tab=history')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const { result } = renderHook(() => useAppTabNavigation())

    act(() => result.current.selectTab('settings'))
    expect(window.history.state).toEqual({ source: 'direct' })
    act(() => result.current.selectTab('main'))

    expect(back).not.toHaveBeenCalled()
    expect(result.current.tab).toBe('main')
    expect(window.location.pathname + window.location.search).toBe('/f/abc234')
  })

  it('does nothing when the already-active destination is selected', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    const { result } = renderHook(() => useAppTabNavigation())

    act(() => result.current.selectTab('main'))

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })
})
