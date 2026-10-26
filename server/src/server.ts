import { createApp } from './app.js'
import { env } from './config/env.js'
import { disconnectPrisma } from './db/prisma.js'
import { logger } from './lib/logger.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, database: env.DATABASE_URL ? 'configured' : 'not configured' },
    'API listening',
  )
})

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Shutting down')

  // Stop taking new connections, let in-flight requests finish, then release the database.
  const forceExit = setTimeout(() => {
    logger.error('Forced exit after timeout')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  server.close(async (error) => {
    await disconnectPrisma().catch((disconnectError: unknown) => logger.error({ err: disconnectError }, 'Database disconnect failed'))
    process.exit(error ? 1 : 0)
  })
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection')
  process.exit(1)
})
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception')
  process.exit(1)
})
