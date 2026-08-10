import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeveloperCredit } from './DeveloperCredit'

describe('DeveloperCredit', () => {
  it('renders the developer attribution as an external link (MGR-SHELL-008)', () => {
    render(<DeveloperCredit />)

    expect(screen.getByText('פותח על ידי')).toBeDefined()
    const link = screen.getByRole('link', { name: 'https://msx.co.il' })
    expect(link.getAttribute('href')).toBe('https://msx.co.il')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
