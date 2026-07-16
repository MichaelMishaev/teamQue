import { describe, expect, it } from 'vitest'
import { generateSlug, SLUG_PATTERN } from './slug'

describe('generateSlug', () => {
  it('returns 6 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const slug = generateSlug()
      expect(slug).toMatch(SLUG_PATTERN)
      expect(slug).not.toMatch(/[01loi]/)
    }
  })

  it('is collision-unlikely across a small batch', () => {
    const batch = new Set(Array.from({ length: 1000 }, () => generateSlug()))
    expect(batch.size).toBeGreaterThan(990)
  })
})
