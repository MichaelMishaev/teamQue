import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { QueueRow } from './QueueRow'

describe('QueueRow', () => {
  it('shows the position number and the single team name', () => {
    render(<QueueRow position={2} teamName="עומר" gamesToday={0} />)
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText(/עומר/)).toBeDefined()
  })

  it('next variant replaces the position with the הבא badge', () => {
    render(<QueueRow position={1} teamName="יוסי" gamesToday={0} next />)
    expect(screen.getByText('הבא')).toBeDefined()
    expect(screen.queryByText('1')).toBeNull()
  })

  it('shows games-today inline as the fairness surface', () => {
    render(<QueueRow position={1} teamName="דניאל" gamesToday={3} />)
    expect(screen.getByText('· 3 היום')).toBeDefined()
  })

  it('hides the games-today hint when the team has not played yet', () => {
    render(<QueueRow position={1} teamName="דניאל" gamesToday={0} />)
    expect(screen.queryByText(/היום/)).toBeNull()
  })

  it('shows the last-played time alongside games-today when provided', () => {
    render(<QueueRow position={1} teamName="דניאל" gamesToday={1} lastPlayedAt="21:12" />)
    expect(screen.getByText('· 1 היום')).toBeDefined()
    expect(screen.getByText('21:12')).toBeDefined()
  })

  it('hides the last-played time when not provided', () => {
    render(<QueueRow position={1} teamName="דניאל" gamesToday={1} />)
    expect(screen.getByText('· 1 היום')).toBeDefined()
    expect(screen.queryByText('21:12')).toBeNull()
  })

  it('shows the nickname alongside the team name when present', () => {
    render(<QueueRow position={1} teamName="דניאל" nickname="הקטן" gamesToday={0} />)
    expect(screen.getByText('(הקטן)')).toBeDefined()
  })

  it('removing state hides the actions menu and shows the remove label', () => {
    render(<QueueRow position={3} teamName="אלון" gamesToday={0} removing />)
    expect(screen.getByText('הסר')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('fires onMenu from the ⋯ trigger', () => {
    const onMenu = vi.fn()
    render(<QueueRow position={1} teamName="א" gamesToday={0} onMenu={onMenu} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onMenu).toHaveBeenCalledOnce()
  })

  it('shows a games-ahead + eta line when both are provided', () => {
    render(<QueueRow position={3} teamName="רון" gamesToday={0} gamesAhead={1} etaSec={540} />)
    expect(screen.getByText('משחק אחד לפניך')).toBeDefined()
    expect(screen.getByText('9')).toBeDefined()
  })

  it('uses plural phrasing for more than one game ahead', () => {
    render(<QueueRow position={5} teamName="שלי" gamesToday={0} gamesAhead={2} etaSec={1080} />)
    expect(screen.getByText('2 משחקים לפניך')).toBeDefined()
    expect(screen.getByText('18')).toBeDefined()
  })

  it('marks the eta as approximate for the unpaired leftover entry', () => {
    render(<QueueRow position={7} teamName="מני" gamesToday={0} gamesAhead={3} etaSec={1620} etaApprox />)
    expect(screen.getByText('(משוער)')).toBeDefined()
  })

  it('hides the games-ahead line when gamesAhead is not provided', () => {
    render(<QueueRow position={1} teamName="טל" gamesToday={0} next />)
    expect(screen.queryByText(/לפניך/)).toBeNull()
  })

  it('grouped rows omit their own border and background', () => {
    const { container } = render(<QueueRow position={3} teamName="רון" gamesToday={0} grouped />)
    expect(container.firstElementChild?.className).not.toContain('rounded-xl')
  })

  it('a dragging grouped row still gets its own standalone card styling', () => {
    const { container } = render(<QueueRow position={3} teamName="רון" gamesToday={0} grouped dragging />)
    expect(container.firstElementChild?.className).toContain('rounded-xl')
  })
})
