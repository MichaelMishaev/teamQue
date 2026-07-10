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
 * SwitchUser). Otherwise the real placeholder providers wrap the real
 * AppGate auth flow; the real socket/API wiring behind those same contexts
 * is a later task.
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
    <RealProviders>
      <AppGate>
        <App />
      </AppGate>
    </RealProviders>
  )
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
