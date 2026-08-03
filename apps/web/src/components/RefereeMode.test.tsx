import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RefereeMode } from './RefereeMode'

function renderMode(overrides: Partial<ComponentProps<typeof RefereeMode>> = {}) {
  const props = {
    fieldName: 'מגרש ראשי',
    captainA: 'שחר',
    captainB: 'טל',
    secondsLeft: 177,
    status: 'live' as const,
    onClose: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onExtend: vi.fn(),
    onFinish: vi.fn(),
    ...overrides,
  }
  render(<RefereeMode {...props} />)
  return props
}

afterEach(() => vi.useRealTimers())

describe('RefereeMode', () => {
  it('renders the active match as a full-viewport timer with referee controls', () => {
    renderMode()

    expect(screen.getByRole('timer', { name: 'זמן נותר במשחק' }).textContent).toBe('02:57')
    expect(
      screen.getByText((_, element) => element?.tagName === 'H1' && element.textContent === 'שחר נגד טל'),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: /השהה/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /נעילת פקדים/ })).toBeDefined()
  })

  it('locks controls and requires a hold to restore them', () => {
    vi.useFakeTimers()
    renderMode()

    fireEvent.click(screen.getByRole('button', { name: 'נעילת פקדים' }))
    expect(screen.getByText('הפקדים נעולים')).toBeDefined()
    expect(screen.queryByRole('button', { name: /השהה/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'חזרה לתור' })).toBeNull()

    const unlock = screen.getByRole('button', { name: 'לחצו והחזיקו לשחרור' })
    fireEvent.pointerDown(unlock)
    act(() => vi.advanceTimersByTime(1200))

    expect(screen.getByRole('button', { name: /השהה/ })).toBeDefined()
  })

  it('requires a hold before it finishes the match', () => {
    vi.useFakeTimers()
    const { onFinish } = renderMode()
    const finish = screen.getByRole('button', { name: 'לחצו והחזיקו לסיום' })

    fireEvent.pointerDown(finish)
    act(() => vi.advanceTimersByTime(1199))
    expect(onFinish).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('cancels a finish hold when the pointer is released early', () => {
    vi.useFakeTimers()
    const { onFinish } = renderMode()
    const finish = screen.getByRole('button', { name: 'לחצו והחזיקו לסיום' })

    fireEvent.pointerDown(finish)
    act(() => vi.advanceTimersByTime(600))
    fireEvent.pointerUp(finish)
    act(() => vi.advanceTimersByTime(600))

    expect(onFinish).not.toHaveBeenCalled()
  })

  it('keeps pause and resume as distinct primary actions', () => {
    const onResume = vi.fn()
    renderMode({ status: 'paused', onResume })

    fireEvent.click(screen.getByRole('button', { name: /המשך/ }))
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /השהה/ })).toBeNull()
  })

  it('puts the deliberate finish action ahead of overtime once time has expired', () => {
    renderMode({ secondsLeft: 0 })

    const controls = screen.getAllByRole('button')
    expect(controls.indexOf(screen.getByRole('button', { name: 'לחצו והחזיקו לסיום' }))).toBeLessThan(
      controls.indexOf(screen.getByRole('button', { name: '+1 דק׳' })),
    )
    expect(screen.queryByRole('button', { name: /השהה/ })).toBeNull()
  })

  it('shows action feedback and disables all mutable controls while a request is pending', () => {
    renderMode({ busy: true, error: 'הפעולה נכשלה — נסו שוב' })

    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByRole('status')).toBeDefined()
    expect((screen.getByRole('button', { name: /השהה/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /נעילת פקדים/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'לחצו והחזיקו לסיום' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps keyboard focus in referee mode and allows escape while unlocked', () => {
    const { onClose } = renderMode()
    const dialog = screen.getByRole('dialog', { name: 'מצב שופט' })
    const close = screen.getByRole('button', { name: 'חזרה לתור' })
    const lock = screen.getByRole('button', { name: 'נעילת פקדים' })

    lock.focus()
    fireEvent.keyDown(lock, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(close, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
