import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AppGate } from '@/screens/AppGate'
import { HomeScreen } from '@/screens/HomeScreen'
import { PublicLineScreen } from '@/screens/PublicLineScreen'
import { parseRoute } from '@/lib/route'
import { applyPwaIdentity } from '@/lib/pwaIdentity'
import { DemoProviders } from '@/state/mock/DemoProviders'
import { RealProviders } from '@/state/real/RealProviders'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

applyPwaIdentity(window.location.hostname, window.location.pathname)

/**
 * VITE_DEMO=1 mounts the mock-backed providers directly (mock data, switchable
 * via SwitchUser). Otherwise the URL decides: the dedicated `/line` route is
 * public and read-only; every manager route is mounted behind AppGate.
 */
const isDemo = import.meta.env.VITE_DEMO === '1'
const route = parseRoute(window.location.pathname, window.location.hostname)

export function Root() {
  // The QR/player route must stay read-only even when local development uses
  // VITE_DEMO=1: it owns its own GET + socket state and mounts no action stack.
  if (route.kind === 'line') return <PublicLineScreen />
  if (isDemo) {
    return (
      <DemoProviders>
        <App />
      </DemoProviders>
    )
  }
  if (route.kind === 'home') {
    return (
      <AppGate>
        <HomeScreen />
      </AppGate>
    )
  }
  return (
    <AppGate>
      <RealProviders slug={route.slug}>
        <App slug={route.slug} />
      </RealProviders>
    </AppGate>
  )
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
