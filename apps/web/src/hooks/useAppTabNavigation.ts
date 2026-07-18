import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appTabHref,
  isManagedTabState,
  managedTabState,
  parseAppTab,
  type AppTab,
} from '@/lib/app-tab-route'

export interface AppTabNavigation {
  tab: AppTab
  hrefFor: (tab: AppTab) => string
  selectTab: (tab: AppTab) => void
}

/**
 * Owns the field shell's one-entry tab history contract. Secondary-to-secondary
 * switches replace that entry, so one system Back always returns to Main.
 */
export function useAppTabNavigation(): AppTabNavigation {
  const [tab, setTab] = useState<AppTab>(() => parseAppTab(window.location.search))
  const backPendingRef = useRef(false)

  useEffect(() => {
    const handlePopState = () => {
      backPendingRef.current = false
      setTab(parseAppTab(window.location.search))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const hrefFor = useCallback((nextTab: AppTab) => appTabHref(window.location.href, nextTab), [])

  const selectTab = useCallback(
    (nextTab: AppTab) => {
      if (nextTab === tab || backPendingRef.current) return

      const nextHref = appTabHref(window.location.href, nextTab)
      const currentState: unknown = window.history.state
      const currentEntryIsManaged = isManagedTabState(currentState) && currentState.tab === tab

      if (nextTab === 'main') {
        if (currentEntryIsManaged) {
          backPendingRef.current = true
          window.history.back()
          return
        }
        window.history.replaceState(currentState, '', nextHref)
        setTab('main')
        return
      }

      if (tab === 'main') {
        window.history.pushState(managedTabState(nextTab), '', nextHref)
      } else if (currentEntryIsManaged) {
        window.history.replaceState(managedTabState(nextTab), '', nextHref)
      } else {
        window.history.replaceState(currentState, '', nextHref)
      }
      setTab(nextTab)
    },
    [tab],
  )

  return { tab, hrefFor, selectTab }
}
