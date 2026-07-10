/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
