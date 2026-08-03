import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldAccessGate } from './FieldAccessGate'

describe('FieldAccessGate', () => {
  it('mounts the field console without a password prompt', () => {
    render(
      <FieldAccessGate slug="abc234">
        <p>field console</p>
      </FieldAccessGate>,
    )

    expect(screen.getByText('field console')).toBeDefined()
    expect(screen.queryByLabelText('סיסמה בת 4 ספרות')).toBeNull()
  })
})
