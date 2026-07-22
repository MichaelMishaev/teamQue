import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FinishMatchConfirmDialog } from './FinishMatchConfirmDialog'

describe('FinishMatchConfirmDialog', () => {
  it('shows the warning and exposes cancel and confirm actions', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(<FinishMatchConfirmDialog open submitting={false} onCancel={onCancel} onConfirm={onConfirm} />)

    expect(screen.getByRole('dialog', { name: 'לסיים את המשחק?' })).toBeDefined()
    expect(screen.getByText('הפעולה תסיים את המשחק הנוכחי. האם אתה בטוח?')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    fireEvent.click(screen.getByRole('button', { name: 'כן, סיים' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cannot be dismissed or submitted while the finish request is pending', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(<FinishMatchConfirmDialog open submitting onCancel={onCancel} onConfirm={onConfirm} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    fireEvent.click(screen.getByRole('button', { name: 'כן, סיים' }))

    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
