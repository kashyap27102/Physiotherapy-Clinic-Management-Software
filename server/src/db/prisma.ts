import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '../config/env.js'
import { PrismaClient } from '../generated/prisma/client.js'
import { unavailable } from '../lib/errors.js'

let client: PrismaClient | undefined

/**
 * Lazy singleton, created on first use. The server starts without DATABASE_URL (skeleton stage);
 * anything that actually needs the database gets a clean 503 instead of a crash at boot.
 */
export function getPrisma(): PrismaClient {
  if (!env.DATABASE_URL) throw unavailable('The database is not configured.')
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) })
  return client
}

export async function disconnectPrisma(): Promise<void> {
  const current = client
  client = undefined
  await current?.$disconnect()
}

export type DatabaseStatus = 'up' | 'down' | 'not_configured'

/** Cheap connectivity check for the readiness endpoint. Never throws. */
export async function pingDatabase(): Promise<DatabaseStatus> {
  if (!env.DATABASE_URL) return 'not_configured'
  try {
    await getPrisma().$queryRaw`SELECT 1`
    return 'up'
  } catch {
    return 'down'
  }
}
