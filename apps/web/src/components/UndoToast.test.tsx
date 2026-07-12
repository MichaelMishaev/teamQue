import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { showStatusToast } from '@/components/UndoToast'

vi.mock('sonner', () => ({
  toast: vi.fn(),
  Toaster: vi.fn(),
}))

describe('showStatusToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a status message without an undo action', () => {
    showStatusToast('toast.matchFinished')

    expect(toast).toHaveBeenCalledWith('המשחק הסתיים', { duration: 5_000 })
  })
})
