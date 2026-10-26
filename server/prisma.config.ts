import { defineConfig } from 'prisma/config'

// Prisma 7 does not read .env by itself. Load it here (Node built-in) so CLI commands such as
// `prisma migrate dev` see DATABASE_URL. Missing file is fine: variables may come from the shell.
try {
  process.loadEnvFile('.env')
} catch {
  // no .env file
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Only required by commands that touch the database. `prisma generate` and `validate` work without it.
    url: process.env['DATABASE_URL'] ?? '',
  },
})
