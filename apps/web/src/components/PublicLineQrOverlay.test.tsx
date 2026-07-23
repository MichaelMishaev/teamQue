import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@/i18n'
import { PUBLIC_LINE_URL } from '@/lib/route'
import { PublicLineQrOverlay } from './PublicLineQrOverlay'

describe('PublicLineQrOverlay', () => {
  it('renders the QR, the public URL, and the scan instruction', () => {
    render(<PublicLineQrOverlay onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: t('publicLine.qr.dialogLabel') })
    expect(dialog.querySelector('img')?.getAttribute('src')).toBeTruthy()
    expect(screen.getByText(t('publicLine.qr.instruction'))).toBeDefined()
    expect(screen.getByText(PUBLIC_LINE_URL)).toBeDefined()
  })

  it('back button closes', () => {
    const onClose = vi.fn()
    render(<PublicLineQrOverlay onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: t('publicLine.qr.back') }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape closes', () => {
    const onClose = vi.fn()
    render(<PublicLineQrOverlay onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('focuses the back button on mount so the staff member can dismiss without hunting', () => {
    render(<PublicLineQrOverlay onClose={vi.fn()} />)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: t('publicLine.qr.back') }))
  })
})
