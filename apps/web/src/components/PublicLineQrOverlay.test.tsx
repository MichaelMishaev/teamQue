import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@/i18n'
import { PUBLIC_LINE_URL, publicLineUrl } from '@/lib/route'
import { PublicLineQrOverlay } from './PublicLineQrOverlay'

describe('PublicLineQrOverlay', () => {
  it('renders the QR, the public URL, and the scan instruction', () => {
    render(<PublicLineQrOverlay onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: t('publicLine.qr.dialogLabel') })
    expect(dialog.querySelector('svg')).not.toBeNull()
    expect(screen.getByText(t('publicLine.qr.instruction'))).toBeDefined()
    expect(screen.getByText(PUBLIC_LINE_URL)).toBeDefined()
    expect(screen.getByTestId('public-view-qr').getAttribute('data-qr-value')).toBe(PUBLIC_LINE_URL)
  })

  it('generates, displays, and shares the exact stable field-queue URL', async () => {
    const url = publicLineUrl('abc234')
    const nativeShare = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share: nativeShare })

    render(<PublicLineQrOverlay url={url} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: t('publicLine.qr.dialogLabel') })).toBeDefined()
    expect(screen.getByText(url)).toBeDefined()
    expect(screen.getByTestId('public-view-qr').getAttribute('data-qr-value')).toBe(url)
    fireEvent.click(screen.getByRole('button', { name: t('publicLine.share') }))
    await vi.waitFor(() => expect(nativeShare).toHaveBeenCalledWith(expect.objectContaining({ url })))
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

  it('share button uses the native share sheet with the public URL', async () => {
    const nativeShare = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share: nativeShare })
    render(<PublicLineQrOverlay onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: t('publicLine.share') }))

    await vi.waitFor(() =>
      expect(nativeShare).toHaveBeenCalledWith(expect.objectContaining({ url: PUBLIC_LINE_URL })),
    )
  })

  it('share falls back to clipboard when the native sheet is unavailable', async () => {
    Object.assign(navigator, { share: undefined })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<PublicLineQrOverlay onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: t('publicLine.share') }))

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(PUBLIC_LINE_URL))
  })
})
