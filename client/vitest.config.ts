import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Seed data and "today" logic assume India time; set before the test workers start.
process.env.TZ = 'Asia/Kolkata'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
})
