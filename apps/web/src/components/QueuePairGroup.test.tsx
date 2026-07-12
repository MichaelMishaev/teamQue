import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
