import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AppGate } from '@/screens/AppGate'
import { DemoProviders } from '@/state/mock/DemoProviders'
import { RealProviders } from '@/state/real/RealProviders'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

/**
 * VITE_DEMO=1 mounts the mock-backed providers directly (mock data, switchable
 * via SwitchUser). Otherwise AppGate resolves the current identity via
 * GET /auth/me first (auth is open — no PIN gate); RealProviders is passed as
 * its `children`, so it (and the GET /sessions/active + /staff + socket calls
 * its effects make) only mounts once `phase === 'authed'`, i.e. once AppGate
 * has an identity to seed AuthContext with.
 */
const isDemo = import.meta.env.VITE_DEMO === '1'

function Root() {
  if (isDemo) {
    return (
      <DemoProviders>
        <App />
      </DemoProviders>
    )
  }
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
