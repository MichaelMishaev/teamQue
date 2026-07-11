import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IntroSplash } from './IntroSplash'

describe('IntroSplash', () => {
  it('renders a decorative overlay with four dots, hidden from the accessibility tree', () => {
    const { container } = render(<IntroSplash />)
    const overlay = container.firstChild as HTMLElement
    expect(overlay.getAttribute('aria-hidden')).toBe('true')
    expect(overlay.querySelectorAll('span')).toHaveLength(4)
  })

  it('stays mounted when a child dot finishes its own animation (bubbled event)', () => {
    const { container } = render(<IntroSplash />)
    const overlay = container.firstChild as HTMLElement
    const dot = overlay.querySelector('span') as HTMLElement

    act(() => {
      fireEvent.animationEnd(dot)
    })

    expect(container.firstChild).not.toBeNull()
  })

  it('unmounts once its own overlay fade-out animation ends', () => {
    const { container } = render(<IntroSplash />)
    const overlay = container.firstChild as HTMLElement

    act(() => {
      fireEvent.animationEnd(overlay)
    })

    expect(container.firstChild).toBeNull()
  })
})
