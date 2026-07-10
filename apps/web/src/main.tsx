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
 * VITE_DEMO=1 mounts the mock-backed providers directly (no backend to
 * authenticate against — the app starts already "signed in", switchable via
 * SwitchUser). Otherwise AppGate drives the real center-PIN → staff-PIN flow
 * first; RealProviders is passed as its `children`, so it (and the
 * GET /sessions/active + /staff + socket calls its effects make) only mounts
 * once `phase === 'authed'` — i.e. once the cookies StaffSessionGuard
 * requires actually exist. Mounting it the other way around (wrapping
 * AppGate) would fire those calls before login and leave them 401'd forever.
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
