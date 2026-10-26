import { randomUUID } from 'node:crypto'
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { v1Router } from './routes/index.js'

/** Builds the Express app. Kept separate from server.ts so tests can call it without opening a port. */
export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  if (env.TRUST_PROXY) app.set('trust proxy', 1)

  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID()
        res.setHeader('X-Request-Id', id)
        return id
      },
      // Query strings can contain patient names or phone numbers (search), and bodies hold clinical
      // data, so only the method and path are ever logged.
      serializers: {
        req: (req: { id: string; method: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url?.split('?')[0],
        }),
        // Response headers are noise in the access log (and cookies must never be logged).
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  )

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: '100kb' }))

  app.use('/api/v1', v1Router)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
