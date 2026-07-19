import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  // Mirror the "@/*" -> "./src/*" alias from tsconfig.json so tests can import
  // modules the same way the app does.
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
