import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CaptainSearchResult, CreateCaptainRow } from './CaptainSearchResult'

describe('CaptainSearchResult', () => {
  it('shows the fairness stats when the captain played today', () => {
    render(<CaptainSearchResult name="דניאל" gamesToday={3} lastPlayedAt="18:42" />)
    expect(screen.getByText(/משחקים היום: 3/)).toBeDefined()
    expect(screen.getByText('18:42')).toBeDefined()
  })

  it('shows never-played-today when games are zero', () => {
    render(<CaptainSearchResult name="יואב" gamesToday={0} />)
    expect(screen.getByText('עוד לא שיחק היום')).toBeDefined()
  })
})

describe('CreateCaptainRow', () => {
  it('soft-warns on duplicate names without blocking', () => {
    render(<CreateCaptainRow name="דניאל" duplicate />)
    expect(screen.getByText(/קיים דניאל נוסף/)).toBeDefined()
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
  })
})
