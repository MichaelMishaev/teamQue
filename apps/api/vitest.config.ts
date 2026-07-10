/// <reference types="vitest/config" />
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Nest's DI relies on `emitDecoratorMetadata`, which Vite's default esbuild
  // transform does not implement — constructor params would silently resolve
  // as undefined for any test that boots a real Nest app (integration tests).
  // unplugin-swc transforms TS via SWC instead, which does emit it.
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    coverage: {
      provider: 'v8',
      include: ['src/auth/**/*.ts'],
      exclude: ['src/auth/**/*.test.ts'],
    },
  },
})
