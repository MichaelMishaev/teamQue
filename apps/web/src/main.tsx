import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AppGate } from '@/screens/AppGate'
import { HomeScreen } from '@/screens/HomeScreen'
import { parseRoute } from '@/lib/route'
import { DemoProviders } from '@/state/mock/DemoProviders'
import { RealProviders } from '@/state/real/RealProviders'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

/**
 * VITE_DEMO=1 mounts the mock-backed providers directly (mock data, switchable
 * via SwitchUser). Otherwise the URL decides: '/' is the public home (create
 * a field + browse the active-fields list, no provider stack needed), '/f/:slug'
 * mounts the existing AppGate/RealProviders/App stack (slug threading into that
 * stack is a follow-up task — this only adds the routing split).
 */
const isDemo = import.meta.env.VITE_DEMO === '1'
const route = parseRoute(window.location.pathname)

function Root() {
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
      <RealProviders>
        <App />
      </RealProviders>
    </AppGate>
  )
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
