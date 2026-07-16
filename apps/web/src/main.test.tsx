import type { Root as ReactRoot } from 'react-dom/client'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthState } from '@/hooks/useAuthState'
import { apiGet, apiPost } from '@/lib/api'
import { createSessionSocket } from '@/lib/socket'

/**
 * Regression coverage for main.tsx's Root composition: navigating to a field
 * route (VITE_DEMO unset, pathname '/f/<slug>') mounts AppGate/RealProviders/
 * App. RealProviders calls useVisitor() unconditionally, which throws unless a
 * VisitorProvider ancestor exists — main.tsx must render one around it.
 *
 * This imports the real main.tsx module (not a hand-rolled copy of its JSX)
 * so it exercises the actual composition. main.tsx's bottom-of-file bootstrap
 * unconditionally calls createRoot(root).render(...); react-dom/client is
 * mocked here only to capture the real root it creates (delegating to the
 * actual implementation) so the test can unmount it afterwards — otherwise
 * App's clock setInterval keeps firing after the test/jsdom env tears down.
 * createRoot's initial commit is scheduled work, not synchronous, so the
 * import is wrapped in `act()` to force it to flush before the test asserts —
 * an uncaught render-time error (no error boundary in this tree) then rejects
 * that `act()` call (caught below via try/catch — `expect(...).resolves`
 * proved unreliable at observing this particular rejection, confirmed by
 * direct experimentation, so this uses a plain await/try-catch instead).
 */

const capturedRoots = vi.hoisted(() => ({ list: [] as ReactRoot[] }))

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: vi.fn((container: Element | DocumentFragment) => {
      const root = actual.createRoot(container)
      capturedRoots.list.push(root)
      return root
    }),
  }
})

vi.mock('@/hooks/useAuthState')
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() }
})
vi.mock('@/lib/socket', () => ({
  createSessionSocket: vi.fn(),
}))

describe('main.tsx Root — field route', () => {
  beforeEach(() => {
    // .env.local sets VITE_DEMO=1 for local dev, and vitest's 'test' mode env
    // load doesn't exclude it here — stub it off so Root() takes the real
    // (AppGate/RealProviders) branch instead of the demo branch.
    vi.stubEnv('VITE_DEMO', '0')
    capturedRoots.list.length = 0
    document.body.innerHTML = '<div id="root"></div>'
    window.history.pushState({}, '', '/f/abc234')
    vi.mocked(useAuthState).mockReturnValue({
      phase: 'authed',
      currentStaff: { id: 'staff-1', name: 'שרה', role: 'manager' },
    })
    vi.mocked(apiGet).mockRejectedValue(new Error('not found'))
    vi.mocked(apiPost).mockResolvedValue({ visitorId: 'v1', nickname: 'אורח 7' })
    vi.mocked(createSessionSocket).mockReturnValue({ disconnect: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const root of capturedRoots.list) root.unmount()
    capturedRoots.list.length = 0
    document.body.innerHTML = ''
    window.history.pushState({}, '', '/')
  })

  it('mounts without throwing (RealProviders.useVisitor() needs a VisitorProvider ancestor)', async () => {
    let threw: unknown = undefined
    try {
      await act(async () => {
        await import('./main')
      })
    } catch (err) {
      threw = err
    }
    expect(threw).toBeUndefined()
  })
})
