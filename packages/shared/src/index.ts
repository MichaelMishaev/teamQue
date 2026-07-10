/**
 * Shared contracts between apps/api and apps/web.
 * zod schemas + inferred TS types for the session snapshot, API shapes,
 * socket events, and error codes (technical-prd §3, §5, §7, §8).
 */
export * from './ids.js'
export * from './enums.js'
export * from './errors.js'
export * from './views.js'
export * from './snapshot.js'
export * from './requests.js'
export * from './summary.js'
export * from './reads.js'
export * from './results.js'
