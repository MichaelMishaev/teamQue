import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldCard } from './FieldCard'

describe('FieldCard', () => {
  it('free with fewer than two teams in the line disables start with a reason', () => {
    render(<FieldCard status="free" fieldName="מגרש" />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('צריך שתי קבוצות בתור')).toBeDefined()
  })

  it('free with two front-of-line teams enables start and names the pair', () => {
    render(<FieldCard status="free" fieldName="מגרש" nextTwo={{ teamA: 'יוסי', teamB: 'רון' }} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/יוסי/)).toBeDefined()
    expect(screen.queryByText('צריך שתי קבוצות בתור')).toBeNull()
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
