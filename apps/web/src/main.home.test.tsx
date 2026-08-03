import type { Root as ReactRoot } from 'react-dom/client'
import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@/screens/AppGate', () => ({
  AppGate: ({ children }: { children: React.ReactNode }) => <div data-testid="app-gate">{children}</div>,
}))
vi.mock('@/screens/HomeScreen', () => ({ HomeScreen: () => <div data-testid="home-screen" /> }))

describe('main.tsx Root — public home route', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO', '0')
    capturedRoots.list.length = 0
    document.body.innerHTML = '<div id="root"></div>'
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const root of capturedRoots.list) act(() => root.unmount())
    capturedRoots.list.length = 0
    document.body.innerHTML = ''
  })

  it('renders the field list without the device AppGate', async () => {
    await act(async () => {
      await import('./main')
    })

    expect(screen.getByTestId('home-screen')).toBeDefined()
    expect(screen.queryByTestId('app-gate')).toBeNull()
  })
})
