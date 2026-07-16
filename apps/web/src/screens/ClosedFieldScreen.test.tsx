import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClosedFieldScreen } from './ClosedFieldScreen'
import { t } from '@/i18n'

const mockNavigateHome = vi.fn()
vi.mock('@/lib/route', () => ({ navigateHome: () => mockNavigateHome() }))

describe('ClosedFieldScreen', () => {
  it('shows the closed title and a create-new CTA that navigates home', () => {
    render(<ClosedFieldScreen />)
    expect(screen.getByText(t('field.closed.title'))).toBeDefined()
    const cta = screen.getByRole('button', { name: t('field.closed.cta') })
    fireEvent.click(cta)
    expect(mockNavigateHome).toHaveBeenCalled()
  })
})
