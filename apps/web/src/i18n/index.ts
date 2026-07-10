/**
 * Minimal typed i18n over locale JSON (devRules N-13: no hardcoded UI strings).
 * Key set is derived from he.json, so a missing key is a compile error.
 */
import he from './he.json'

export type MessageKey = keyof typeof he

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = he[key]
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
