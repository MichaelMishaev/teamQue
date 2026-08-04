import type { FieldListItem, SessionSnapshot } from 'shared'
import type { FieldAccessClient } from '@/screens/FieldAccessGate'
import { t } from '@/i18n'
import { createMockSession } from './mockSession'

const STORAGE_PREFIX = 'queueManager.demoField.'
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

interface StoredDemoField {
  name: string
  passwordHash: string | null
}

function key(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`
}

function isStoredDemoField(value: unknown): value is StoredDemoField {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'passwordHash' in value &&
    (typeof value.passwordHash === 'string' || value.passwordHash === null)
  )
}

function readField(slug: string): StoredDemoField | null {
  const raw = sessionStorage.getItem(key(slug))
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isStoredDemoField(parsed) ? parsed : null
  } catch {
    return null
  }
}

function createSlug(): string {
  const values = crypto.getRandomValues(new Uint8Array(6))
  let slug = ''
  for (const value of values) {
    const character = ALPHABET[value % ALPHABET.length]
    if (character === undefined) throw new Error('demo slug alphabet is empty')
    slug += character
  }
  return slug
}

async function passwordHash(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function createDemoField(name: string, password?: string): Promise<string> {
  const slug = createSlug()
  const stored: StoredDemoField = { name, passwordHash: password === undefined ? null : await passwordHash(password) }
  sessionStorage.setItem(key(slug), JSON.stringify(stored))
  return slug
}

export function listDemoFields(): FieldListItem[] {
  const fields: FieldListItem[] = []
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const storageKey = sessionStorage.key(index)
    if (storageKey === null || !storageKey.startsWith(STORAGE_PREFIX)) continue
    const slug = storageKey.slice(STORAGE_PREFIX.length)
    const field = readField(slug)
    if (field === null) continue
    fields.push({ slug, name: field.name, createdAt: new Date(0).toISOString(), queueLength: 0, hasLiveMatch: false })
  }
  return fields
}

export function getDemoFieldName(slug: string): string | null {
  return readField(slug)?.name ?? null
}

/** Builds the read-only public snapshot used by local demo QR destinations. */
export function getDemoPublicLineSnapshot(slug: string): SessionSnapshot | null {
  const isBaseDemoField = slug === 'demo23'
  const fieldName = isBaseDemoField ? t('home.create.nameDefault') : getDemoFieldName(slug)
  if (fieldName === null) return null
  return createMockSession({ slug, fieldName, seedDemoData: isBaseDemoField }).getSnapshotState().snapshot
}

export const demoFieldAccessClient: FieldAccessClient = {
  async getStatus(slug) {
    const field = readField(slug)
    if (field === null) return { passwordRequired: false, granted: true }
    return { passwordRequired: field.passwordHash !== null, granted: field.passwordHash === null }
  },
  async unlock(slug, password) {
    const field = readField(slug)
    if (field?.passwordHash === null) return
    if (field === null || field.passwordHash !== (await passwordHash(password))) throw new Error('wrong password')
  },
}
