import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it('plays the end-flash animation when alerting', () => {
    const { container } = render(
      <FieldCard status="live" fieldName="מגרש" captainA="א" captainB="ב" secondsLeft={0} alerting />,
    )
    expect(container.querySelector('section')?.style.animation).toContain('end-flash')
  })

  it('does not flash when not alerting', () => {
    const { container } = render(
      <FieldCard status="live" fieldName="מגרש" captainA="א" captainB="ב" secondsLeft={0} />,
    )
    expect(container.querySelector('section')?.style.animation).toBe('')
  })

  it('finished (00:00) with a waiting pair labels time up, previews the next pair, and offers finish-and-next', () => {
    render(
      <FieldCard
        status="live"
        fieldName="מגרש"
        captainA="שחר"
        captainB="טל"
        secondsLeft={0}
        nextTwo={{ teamA: 'יוסי', teamB: 'רון' }}
      />,
    )
    expect(screen.getByText('נגמר הזמן')).toBeDefined()
    expect(screen.getByText(/יוסי/)).toBeDefined()
    expect(screen.getByRole('button', { name: /סיים והתחל הבא/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /סיים בלבד/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /דק/ })).toBeDefined()
    expect(screen.queryByText(/השהה/)).toBeNull()
  })

  it('finished finish-and-next button calls onFinishAndNext', () => {
    const onFinishAndNext = vi.fn()
    render(
      <FieldCard
        status="live"
        fieldName="מגרש"
        captainA="שחר"
        captainB="טל"
        secondsLeft={0}
        nextTwo={{ teamA: 'יוסי', teamB: 'רון' }}
        onFinishAndNext={onFinishAndNext}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /סיים והתחל הבא/ }))
    expect(onFinishAndNext).toHaveBeenCalledTimes(1)
  })

  it('finished "finish only" button calls onFinish', () => {
    const onFinish = vi.fn()
    render(
      <FieldCard
        status="live"
        fieldName="מגרש"
        captainA="שחר"
        captainB="טל"
        secondsLeft={0}
        nextTwo={{ teamA: 'יוסי', teamB: 'רון' }}
        onFinish={onFinish}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /סיים בלבד/ }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('finished with fewer than two waiting collapses to a plain finish, no next-game affordance', () => {
    const onFinish = vi.fn()
    render(
      <FieldCard status="live" fieldName="מגרש" captainA="שחר" captainB="טל" secondsLeft={0} onFinish={onFinish} />,
    )
    expect(screen.queryByRole('button', { name: /סיים והתחל הבא/ })).toBeNull()
    expect(screen.queryByText('הבא במגרש:')).toBeNull()
    const finish = screen.getByRole('button', { name: 'סיים' })
    fireEvent.click(finish)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})
