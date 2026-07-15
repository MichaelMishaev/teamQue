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
        direction="down"
        occupantNames={['דני', 'עומר']}
        shiftCount={1}
        unit="pair"
      />,
    )
    expect(screen.queryByText(/יוסי/)).toBeNull()
  })

  it('shows a two-way switch title when occupantNames is provided (an adjacent, 1-slot move)', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="down"
        occupantNames={['דני', 'עומר']}
        shiftCount={1}
        unit="pair"
      />,
    )
    expect(screen.getByText('להחליף בין יוסי / רון ⇄ דני / עומר?')).toBeDefined()
  })

  it('shows a move-down-with-count title when occupantNames is null', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="down"
        occupantNames={null}
        shiftCount={3}
        unit="pair"
      />,
    )
    expect(screen.getByText('להזיז את יוסי / רון למטה? (עוד 3 זוגות יזוזו מקום)')).toBeDefined()
  })

  it('shows a move-up-with-count title when occupantNames is null and direction is up', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="up"
        occupantNames={null}
        shiftCount={2}
        unit="pair"
      />,
    )
    expect(screen.getByText('להזיז את יוסי / רון למעלה? (עוד 2 זוגות יזוזו מקום)')).toBeDefined()
  })

  it('does not call onConfirm until confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        groupANames={['א', 'ב']}
        direction="down"
        occupantNames={['ג', 'ד']}
        shiftCount={1}
        unit="pair"
      />,
    )
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm exactly once when confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        groupANames={['א', 'ב']}
        direction="down"
        occupantNames={['ג', 'ד']}
        shiftCount={1}
        unit="pair"
      />,
    )
    fireEvent.click(screen.getByText('אישור'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel calls onCancel without ever calling onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={onConfirm}
        onCancel={onCancel}
        groupANames={['א', 'ב']}
        direction="down"
        occupantNames={['ג', 'ד']}
        shiftCount={1}
        unit="pair"
      />,
    )
    fireEvent.click(screen.getByText('ביטול'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows a move-down-with-team-count title when unit is "team"', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי']}
        direction="down"
        occupantNames={null}
        shiftCount={3}
        unit="team"
      />,
    )
    expect(screen.getByText('להזיז את יוסי למטה? (עוד 3 קבוצות יזוזו מקום)')).toBeDefined()
  })

  it('shows a move-up-with-team-count title when unit is "team"', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי']}
        direction="up"
        occupantNames={null}
        shiftCount={2}
        unit="team"
      />,
    )
    expect(screen.getByText('להזיז את יוסי למעלה? (עוד 2 קבוצות יזוזו מקום)')).toBeDefined()
  })
})
