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
        displaced={[['דני', 'עומר']]}
      />,
    )
    expect(screen.queryByText(/יוסי/)).toBeNull()
  })

  it('shows a two-way switch title when exactly one group is displaced (an adjacent, 1-slot move) — even though that one group has two names', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="down"
        displaced={[['דני', 'עומר']]}
      />,
    )
    expect(screen.getByText('להחליף בין יוסי / רון ⇄ דני / עומר?')).toBeDefined()
  })

  it('names every displaced group for a multi-slot pair-drag, not a bare count', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי', 'רון']}
        direction="down"
        displaced={[
          ['דני', 'עומר'],
          ['משה', 'אבי'],
        ]}
      />,
    )
    expect(screen.getByText('להזיז את יוסי / רון למטה? (דני / עומר, משה / אבי יזוזו מקום)')).toBeDefined()
  })

  it('names every displaced entity for a multi-slot move up, not a bare count', () => {
    render(
      <PairSwitchConfirmDialog open onConfirm={vi.fn()} onCancel={vi.fn()} groupANames={['יוסי', 'רון']} direction="up" displaced={[['דני'], ['עומר']]} />,
    )
    expect(screen.getByText('להזיז את יוסי / רון למעלה? (דני, עומר יזוזו מקום)')).toBeDefined()
  })

  it('names every displaced entity for a multi-slot single-row move, not a bare count', () => {
    render(
      <PairSwitchConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        groupANames={['יוסי']}
        direction="down"
        displaced={[['דני'], ['עומר'], ['משה']]}
      />,
    )
    expect(screen.getByText('להזיז את יוסי למטה? (דני, עומר, משה יזוזו מקום)')).toBeDefined()
  })

  it('does not call onConfirm until confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(<PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={vi.fn()} groupANames={['א', 'ב']} direction="down" displaced={[['ג', 'ד']]} />)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm exactly once when confirm is tapped', () => {
    const onConfirm = vi.fn()
    render(<PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={vi.fn()} groupANames={['א', 'ב']} direction="down" displaced={[['ג', 'ד']]} />)
    fireEvent.click(screen.getByText('אישור'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel calls onCancel without ever calling onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<PairSwitchConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} groupANames={['א', 'ב']} direction="down" displaced={[['ג', 'ד']]} />)
    fireEvent.click(screen.getByText('ביטול'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
