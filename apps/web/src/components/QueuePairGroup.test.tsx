import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueuePairGroup } from './QueuePairGroup'

describe('QueuePairGroup', () => {
  it('renders the label and both children rows', () => {
    render(
      <QueuePairGroup label="זוג 2" variant="default">
        <div>Row A</div>
        <div>Row B</div>
      </QueuePairGroup>,
    )
    expect(screen.getByText('זוג 2')).toBeDefined()
    expect(screen.getByText('Row A')).toBeDefined()
    expect(screen.getByText('Row B')).toBeDefined()
  })

  it('renders a single child for a solo (unpaired) group with a dashed border', () => {
    const { container } = render(
      <QueuePairGroup label="ממתין/ה לזוג" variant="solo">
        <div>Row Only</div>
      </QueuePairGroup>,
    )
    expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
    expect(container.querySelector('.border-dashed')).not.toBeNull()
  })

  it('gives the next pair an accent-colored label', () => {
    const { container } = render(
      <QueuePairGroup label="זוג 1 · הבא" variant="next">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(container.querySelector('.text-accent')).not.toBeNull()
  })

  it('renders a grip handle for a pair variant but not for solo', () => {
    const { rerender, container } = render(
      <QueuePairGroup label="זוג 2" variant="default">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(screen.getByRole('button', { name: 'הזז את זוג 2 — הקישו פעמיים והחזיקו כדי לגרור' })).toBeDefined()

    rerender(
      <QueuePairGroup label="ממתין/ה לזוג" variant="solo">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('calls onGripPointerDown when the grip receives a pointerdown', () => {
    const onGripPointerDown = vi.fn()
    render(
      <QueuePairGroup label="זוג 2" variant="default" onGripPointerDown={onGripPointerDown}>
        <div>Row</div>
      </QueuePairGroup>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: /זוג 2/ }))
    expect(onGripPointerDown).toHaveBeenCalledTimes(1)
  })

  it('shows the armed state on the grip', () => {
    render(
      <QueuePairGroup label="זוג 2" variant="default" gripState="armed">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(screen.getByRole('button', { name: /זוג 2/ }).className).toContain('bg-warn')
  })

  it('shows the holding state on the grip', () => {
    render(
      <QueuePairGroup label="זוג 2" variant="default" gripState="holding">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(screen.getByRole('button', { name: /זוג 2/ }).className).toContain('bg-accent-dim')
  })

  it('sets the data-group-id attribute when groupId is provided', () => {
    const { container } = render(
      <QueuePairGroup label="זוג 2" variant="default" groupId="e3">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(container.querySelector('[data-group-id="e3"]')).not.toBeNull()
  })
})
