import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/security/**/*.test.{ts,tsx}', 'tests/contract/**/*.test.{ts,tsx}'],
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/lib/**', 'src/features/**/schemas/**'],
      thresholds: { statements: 70, branches: 70, functions: 70, lines: 70 },
    },
  },
})
