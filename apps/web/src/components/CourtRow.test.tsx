import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CourtRow } from '@/components/CourtRow'
import { t } from '@/i18n'
import { DEFAULT_FIELD_NAME, type FieldListItem } from 'shared'

const court: FieldListItem = {
  slug: 'independence-1',
  name: DEFAULT_FIELD_NAME,
  createdAt: '2026-07-17T17:00:00.000Z',
  queueLength: 3,
  hasLiveMatch: false,
}

describe('CourtRow', () => {
  it('makes entering the court an explicit action', () => {
    render(<CourtRow court={court} onOpen={vi.fn()} />)

    expect(screen.getByText(t('home.court.defaultEnterHint'))).toBeDefined()
    expect(screen.getByRole('button').textContent).toContain(court.name)
    expect(screen.getByRole('button').textContent).toContain(t('field.state.free'))
    expect(screen.getByRole('img', { name: t('home.court.defaultImageAlt') })).toBeDefined()
    const video = document.querySelector('video')
    expect(video?.autoplay).toBe(true)
    expect(video?.loop).toBe(true)
    expect(video?.muted).toBe(true)
    expect(video?.className).toContain('motion-reduce:hidden')
    expect(video?.parentElement?.className).toContain('aspect-[2.6/1]')
  })

  it('opens the selected court when the card is tapped', () => {
    const onOpen = vi.fn()
    render(<CourtRow court={court} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith(court.slug)
  })
})
