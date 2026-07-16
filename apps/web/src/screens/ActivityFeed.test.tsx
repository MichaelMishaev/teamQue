import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityFeed } from './ActivityFeed'
import { ActivityContext, type ActivityEntry } from '@/state/ActivityContext'

function renderFeed(entries: ActivityEntry[]) {
  render(
    <ActivityContext.Provider value={entries}>
      <ActivityFeed />
    </ActivityContext.Provider>,
  )
}

describe('ActivityFeed', () => {
  it('shows the empty state when there is no activity', () => {
    renderFeed([])
    expect(screen.getByText('אין פעילות עדיין')).toBeDefined()
  })

  it('renders a staff-attributed row with the staff name and action message', () => {
    renderFeed([
      { id: 'a1', atIso: '2026-07-10T18:42:00.000Z', action: 'match.start', staffName: 'שרה', captainA: 'דניאל', captainB: 'נועם', fieldName: 'מגרש ראשי' },
    ])
    expect(screen.getByText('שרה', { exact: false })).toBeDefined()
    expect(screen.getByText(/התחלת משחק: דניאל נגד נועם \(מגרש ראשי\)/)).toBeDefined()
  })

  it('renders an automatic row italic/muted without a staff name', () => {
    renderFeed([{ id: 'a2', atIso: '2026-07-10T18:48:00.000Z', action: 'match.finish.auto', staffName: null, captainA: 'א', captainB: 'ב' }])
    const message = screen.getByText(/סיום אוטומטי/)
    expect(message.className).toContain('italic')
  })

  it('renders the open-fields actions with their own labels, not the team-update fallback', () => {
    renderFeed([{ id: 'a3', atIso: '2026-07-10T18:50:00.000Z', action: 'field.expire', staffName: null }])
    expect(screen.getByText(/סגירה אוטומטית של מגרש/)).toBeDefined()
  })
})
