/**
 * Shared contracts between apps/api and apps/web.
 * zod schemas + inferred TS types for the session snapshot, API shapes,
 * socket events, and error codes (technical-prd §3, §5, §7, §8).
 */
export * from './ids'
export * from './enums'
export * from './errors'
export * from './views'
export * from './snapshot'
export * from './requests'
export * from './summary'
