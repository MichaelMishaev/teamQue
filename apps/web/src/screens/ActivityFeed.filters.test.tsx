import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityContext, type ActivityEntry, type ActivityLogSource } from '@/state/ActivityContext'
import { ActivityFeed } from './ActivityFeed'

const actionEntry: ActivityEntry = {
  id: 'action-1',
  atIso: '2026-07-17T18:42:00.000Z',
  action: 'line.addToLine',
  rawAction: 'line.added',
  eventKind: 'action',
  outcome: 'success',
  staffId: 'staff-1',
  staffName: 'שרה',
}

const exceptionEntry: ActivityEntry = {
  id: 'exception-1',
  atIso: '2026-07-17T18:48:00.000Z',
  action: 'exception',
  rawAction: 'PATCH /sessions/:id/line',
  eventKind: 'exception',
  outcome: 'rejected',
  staffId: 'staff-1',
  staffName: 'שרה',
  errorCode: 'VALIDATION_FAILED',
  statusCode: 409,
  correlationId: '4c2f9b1a-6e21-4a3d-9f3a-1b2c3d4e5f60',
  requestMethod: 'PATCH',
  requestPath: '/sessions/:id/line',
}

describe('ActivityFeed full-log filters', () => {
  it('filters exceptions server-side and exposes action, actor, status, and exact-time controls', async () => {
    const loadPage = vi.fn<ActivityLogSource['loadPage']>().mockImplementation(async (filters) => ({
      entries: filters.eventKind === 'exception' ? [exceptionEntry] : [actionEntry],
      nextCursor: null,
      actions: [
        { action: 'line.added', count: 1 },
        { action: 'PATCH /sessions/:id/line', count: 1 },
      ],
      actors: [{ staffId: 'staff-1', staffName: 'שרה', count: 2 }],
    }))

    render(
      <ActivityContext.Provider value={{ entries: [], revision: null, loadPage }}>
        <ActivityFeed />
      </ActivityContext.Provider>,
    )

    await screen.findByText(/הוספה לתור/)
    fireEvent.click(screen.getByRole('button', { name: 'חריגות' }))

    await waitFor(() => expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ eventKind: 'exception' }), undefined))
    expect(await screen.findByText(/פעולה נדחתה/)).toBeDefined()
    expect(screen.getByText('VALIDATION_FAILED')).toBeDefined()
    expect(screen.getByLabelText('סינון לפי פעולה')).toBeDefined()
    expect(screen.getByLabelText('סינון לפי מבצע')).toBeDefined()
    expect(screen.getByLabelText('סינון לפי קוד מצב')).toBeDefined()
    expect(screen.getByLabelText('מתאריך ושעה')).toBeDefined()
    expect(screen.getByLabelText('עד תאריך ושעה')).toBeDefined()
  })

  it('appends cursor pages without replacing previously loaded history', async () => {
    const loadPage = vi.fn<ActivityLogSource['loadPage']>()
      .mockResolvedValueOnce({ entries: [actionEntry], nextCursor: 'next-1', actions: [], actors: [] })
      .mockResolvedValueOnce({ entries: [exceptionEntry], nextCursor: null, actions: [], actors: [] })

    render(
      <ActivityContext.Provider value={{ entries: [], revision: null, loadPage }}>
        <ActivityFeed />
      </ActivityContext.Provider>,
    )

    await screen.findByText(/הוספה לתור/)
    fireEvent.click(screen.getByRole('button', { name: 'טען עוד' }))

    await waitFor(() => expect(loadPage).toHaveBeenLastCalledWith(expect.any(Object), 'next-1'))
    expect(screen.getByText(/הוספה לתור/)).toBeDefined()
    expect(await screen.findByText(/פעולה נדחתה/)).toBeDefined()
  })
})
