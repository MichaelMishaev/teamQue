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

vi.mock('./App', () => ({ default: () => <div data-testid="manager-app" /> }))
vi.mock('@/screens/AppGate', () => ({ AppGate: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/screens/PublicLineScreen', () => ({
  PublicLineScreen: () => <div data-testid="public-line-root" />,
}))
vi.mock('@/state/mock/DemoProviders', () => ({
  DemoProviders: ({ children }: { children: React.ReactNode }) => <div data-testid="demo-providers">{children}</div>,
}))
vi.mock('@/state/real/RealProviders', () => ({
  RealProviders: ({ children }: { children: React.ReactNode }) => <div data-testid="real-providers">{children}</div>,
}))

describe('main.tsx Root — public line route', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO', '1')
    capturedRoots.list.length = 0
    document.body.innerHTML = '<div id="root"></div>'
    window.history.replaceState({}, '', '/line')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const root of capturedRoots.list) {
      act(() => root.unmount())
    }
    capturedRoots.list.length = 0
    document.body.innerHTML = ''
    window.history.replaceState({}, '', '/')
  })

  it('mounts only the public screen, even when demo manager providers are enabled', async () => {
    await act(async () => {
      await import('./main')
    })

    expect(screen.getByTestId('public-line-root')).toBeDefined()
    expect(screen.queryByTestId('manager-app')).toBeNull()
    expect(screen.queryByTestId('demo-providers')).toBeNull()
    expect(screen.queryByTestId('real-providers')).toBeNull()
  })
})
