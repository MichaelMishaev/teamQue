/**
 * Share-URL slug for a public field (open-fields spec §3.1): 6 chars from an
 * unambiguous alphabet (no 0/1/o/l/i), crypto-random. Uniqueness is enforced
 * by the `sessions_slug_unique` index — callers retry on collision
 * (fields.service.ts), this function is just the candidate generator.
 */
import { randomInt } from 'node:crypto'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const SLUG_LENGTH = 6

export const SLUG_PATTERN = new RegExp(`^[${ALPHABET}]{${SLUG_LENGTH}}$`)

export function generateSlug(): string {
  let slug = ''
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    slug += ALPHABET.charAt(randomInt(ALPHABET.length))
  }
  return slug
}
