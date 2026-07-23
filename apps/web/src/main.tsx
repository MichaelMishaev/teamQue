import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AppGate } from '@/screens/AppGate'
import { HomeScreen } from '@/screens/HomeScreen'
import { PublicLineScreen } from '@/screens/PublicLineScreen'
import { parseRoute } from '@/lib/route'
import { DemoProviders } from '@/state/mock/DemoProviders'
import { RealProviders } from '@/state/real/RealProviders'
import { VisitorProvider } from '@/state/VisitorContext'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

/**
 * VITE_DEMO=1 mounts the mock-backed providers directly (mock data, switchable
 * via SwitchUser). Otherwise the URL decides: '/' is the public home (create
 * a field + browse the active-fields list, no provider stack needed), '/f/:slug'
 * mounts the AppGate/RealProviders/App stack, seeded and socket-joined to that
 * slug (RealProviders/App both take it as a prop).
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
  if (route.kind === 'home') return <HomeScreen />
  return (
    <AppGate>
      <VisitorProvider>
        <RealProviders slug={route.slug}>
          <App slug={route.slug} />
        </RealProviders>
      </VisitorProvider>
    </AppGate>
  )
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
