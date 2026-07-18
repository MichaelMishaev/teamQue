/**
 * Pure URL/history-state contract for the field's top-level destinations.
 * Main is canonical (no query value); secondary destinations are restorable.
 */
export const APP_TABS = ['main', 'history', 'activity', 'settings'] as const

export type AppTab = (typeof APP_TABS)[number]
export type SecondaryAppTab = Exclude<AppTab, 'main'>

export interface ManagedTabState {
  kind: 'qlm-tab'
  tab: SecondaryAppTab
}

const TAB_PARAM = 'tab'
const MANAGED_STATE_KIND = 'qlm-tab'
const SECONDARY_TABS: readonly SecondaryAppTab[] = ['history', 'activity', 'settings']

function isSecondaryAppTab(value: unknown): value is SecondaryAppTab {
  return typeof value === 'string' && SECONDARY_TABS.some((tab) => tab === value)
}

export function parseAppTab(search: string): AppTab {
  const values = new URLSearchParams(search).getAll(TAB_PARAM)
  const value = values[0]
  return values.length === 1 && isSecondaryAppTab(value) ? value : 'main'
}

export function appTabHref(currentHref: string, tab: AppTab): string {
  const url = new URL(currentHref)
  if (tab === 'main') {
    url.searchParams.delete(TAB_PARAM)
  } else {
    url.searchParams.set(TAB_PARAM, tab)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function managedTabState(tab: SecondaryAppTab): ManagedTabState {
  return { kind: MANAGED_STATE_KIND, tab }
}

export function isManagedTabState(value: unknown): value is ManagedTabState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Reflect.get(value, 'kind') === MANAGED_STATE_KIND && isSecondaryAppTab(Reflect.get(value, 'tab'))
}
