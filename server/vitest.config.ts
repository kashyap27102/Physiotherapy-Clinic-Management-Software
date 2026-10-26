import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Tests never talk to a real database or read a developer's shell configuration.
    env: { NODE_ENV: 'test', DATABASE_URL: '', CORS_ORIGINS: 'http://localhost:5173', TRUST_PROXY: 'false' },
  },
})
