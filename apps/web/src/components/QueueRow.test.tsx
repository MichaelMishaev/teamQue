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
})
