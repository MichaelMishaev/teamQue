import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { QueueRow } from './QueueRow'

describe('QueueRow', () => {
  it('shows position number and both captains', () => {
    render(<QueueRow position={2} captainA="עומר" captainB="איתי" />)
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText(/עומר/)).toBeDefined()
    expect(screen.getByText(/איתי/)).toBeDefined()
  })

  it('next variant replaces the position with the הבא badge', () => {
    render(<QueueRow position={1} captainA="יוסי" captainB="רון" next />)
    expect(screen.getByText('הבא')).toBeDefined()
    expect(screen.queryByText('1')).toBeNull()
  })

  it('removing state hides the actions menu and shows the remove label', () => {
    render(<QueueRow position={3} captainA="אלון" captainB="שחר" removing />)
    expect(screen.getByText('הסר')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('fires onMenu from the ⋯ trigger', () => {
    const onMenu = vi.fn()
    render(<QueueRow position={1} captainA="א" captainB="ב" onMenu={onMenu} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onMenu).toHaveBeenCalledOnce()
  })
})
