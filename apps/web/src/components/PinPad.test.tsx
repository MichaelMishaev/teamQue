import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PinPad } from './PinPad'

describe('PinPad', () => {
  it('reports tapped digits', () => {
    const onDigit = vi.fn()
    render(<PinPad filled={0} onDigit={onDigit} />)
    fireEvent.click(screen.getByText('7'))
    expect(onDigit).toHaveBeenCalledWith(7)
  })

  it('lockout hides the keypad and shows the countdown', () => {
    render(<PinPad filled={0} lockedForSec={47} />)
    expect(screen.queryByText('7')).toBeNull()
    expect(screen.getByText(/00:47/)).toBeDefined()
  })

  it('expired lockout restores the keypad', () => {
    render(<PinPad filled={0} lockedForSec={0} />)
    expect(screen.getByText('7')).toBeDefined()
  })
})
