import { defineConfig } from 'vitest/config'

// Developer convenience: pick up TEST_DATABASE_URL from .env. Missing file is fine (CI sets it directly).
try {
  process.loadEnvFile('.env')
} catch {
  // no .env file
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Tests never read a developer's shell configuration. The app itself never gets a database URL here;
    // only the tenant-isolation tests use TEST_DATABASE_URL and are skipped when it is not set.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: '',
      CORS_ORIGINS: 'http://localhost:5173',
      TRUST_PROXY: 'false',
      TEST_DATABASE_URL: process.env['TEST_DATABASE_URL'] ?? '',
    },
  },
})
