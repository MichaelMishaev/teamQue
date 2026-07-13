import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { Sheet } from './sheet'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
  Toaster: vi.fn(),
}))

describe('Sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dismisses any active toast when it opens, so an undo toast never covers its own action row (regression: see gh#1)', () => {
    render(
      <Sheet open onClose={() => {}} title="t">
        <div>content</div>
      </Sheet>,
    )
    expect(toast.dismiss).toHaveBeenCalled()
  })

  it('does not touch toasts while staying closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} title="t">
        <div>content</div>
      </Sheet>,
    )
    expect(toast.dismiss).not.toHaveBeenCalled()
  })
})
