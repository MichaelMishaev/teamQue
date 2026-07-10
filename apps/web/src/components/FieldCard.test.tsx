import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldCard } from './FieldCard'

describe('FieldCard', () => {
  it('free without a next match disables start', () => {
    render(<FieldCard status="free" fieldName="מגרש" />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('free with next-up enables start and names the pair', () => {
    render(<FieldCard status="free" fieldName="מגרש" nextUp={{ captainA: 'יוסי', captainB: 'רון' }} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/יוסי/)).toBeDefined()
  })

  it('live under 60s derives the ending state badge', () => {
    render(<FieldCard status="live" fieldName="מגרש" captainA="א" captainB="ב" secondsLeft={30} />)
    expect(screen.getByText('מסתיים')).toBeDefined()
    expect(screen.getByText('00:30')).toBeDefined()
  })

  it('paused offers resume as the primary action', () => {
    render(<FieldCard status="paused" fieldName="מגרש" captainA="א" captainB="ב" secondsLeft={120} />)
    expect(screen.getByText(/המשך/)).toBeDefined()
    expect(screen.queryByText(/השהה/)).toBeNull()
  })
})
