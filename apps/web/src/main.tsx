import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AppGate } from '@/screens/AppGate'
import { FieldAccessGate } from '@/screens/FieldAccessGate'
import { HomeScreen } from '@/screens/HomeScreen'
import { PublicLineScreen } from '@/screens/PublicLineScreen'
import { t } from '@/i18n'
import { parseRoute } from '@/lib/route'
import { applyPwaIdentity } from '@/lib/pwaIdentity'
import { DemoProviders } from '@/state/mock/DemoProviders'
import {
  createDemoField,
  demoFieldAccessClient,
  getDemoFieldName,
  getDemoPublicLineSnapshot,
  listDemoFields,
} from '@/state/mock/demoFields'
import { RealProviders } from '@/state/real/RealProviders'
import type { FieldListItem } from 'shared'

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
const baseDemoCourt: FieldListItem =
  {
    slug: 'demo23',
    name: t('home.create.nameDefault'),
    createdAt: '2026-08-02T00:00:00.000Z',
    queueLength: 5,
    hasLiveMatch: true,
  }

export function Root() {
  // The QR/player route must stay read-only even when local development uses
  // VITE_DEMO=1: it owns its own GET + socket state and mounts no action stack.
  if (route.kind === 'line') {
    if (isDemo) {
      const publicSlug = route.slug ?? baseDemoCourt.slug
      return (
        <PublicLineScreen
          slug={publicSlug}
          initialSnapshot={getDemoPublicLineSnapshot(publicSlug)}
          connectRealtime={false}
        />
      )
    }
    return route.slug === undefined ? <PublicLineScreen /> : <PublicLineScreen slug={route.slug} />
  }
  if (isDemo) {
    if (route.kind === 'home') return <HomeScreen initialCourts={[baseDemoCourt, ...listDemoFields()]} createDemoField={createDemoField} />
    const isBaseDemoField = route.slug === baseDemoCourt.slug
    const fieldName = isBaseDemoField ? baseDemoCourt.name : (getDemoFieldName(route.slug) ?? route.slug)
    return (
      <FieldAccessGate slug={route.slug} client={demoFieldAccessClient}>
        <DemoProviders slug={route.slug} fieldName={fieldName} seedDemoData={isBaseDemoField}>
          <App slug={route.slug} />
        </DemoProviders>
      </FieldAccessGate>
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
      <FieldAccessGate slug={route.slug}>
        <RealProviders slug={route.slug}>
          <App slug={route.slug} />
        </RealProviders>
      </FieldAccessGate>
    </AppGate>
  )
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
