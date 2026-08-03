import type { ReactNode } from 'react'

export interface FieldAccessClient {
  getStatus: (slug: string) => Promise<{ passwordRequired: boolean; granted: boolean }>
  unlock: (slug: string, password: string) => Promise<void>
}

/**
 * Previously gated password-protected staff fields. Field passwords are
 * disabled — always mount the live field console.
 */
export function FieldAccessGate({ children }: { slug: string; children: ReactNode; client?: FieldAccessClient }) {
  return <>{children}</>
}
