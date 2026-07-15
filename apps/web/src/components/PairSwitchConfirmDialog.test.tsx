import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PairSwitchConfirmDialog } from './PairSwitchConfirmDialog'

describe('PairSwitchConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <PairSwitchConfirmDialog
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        occupantNames={['דני', 'עומר']}
      />,
    )
    expect(screen.queryByText(/יוסי/)).toBeNull()
  })

  it('shows a title naming both the moved and the occupant entities', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        occupantNames={['דני', 'עומר']}
      />,
    )
    expect(screen.getByText('להחליף בין יוסי / רון ⇄ דני / עומר?')).toBeDefined()
  })

  it('does not call onConfirm until confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={vi.fn()} groupANames={['א', 'ב']} occupantNames={['ג', 'ד']} />,
    )
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm exactly once when confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={vi.fn()} groupANames={['א', 'ב']} occupantNames={['ג', 'ד']} />,
    )
    fireEvent.click(screen.getByText('אישור'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel calls onCancel without ever calling onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} groupANames={['א', 'ב']} occupantNames={['ג', 'ד']} />,
    )
    fireEvent.click(screen.getByText('ביטול'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
