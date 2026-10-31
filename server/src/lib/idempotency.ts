import { createHash } from 'node:crypto'
import type { Request } from 'express'
import { requireAuthContext, tenantDbFor } from '../auth/context.js'
import { Prisma } from '../generated/prisma/client.js'
import { AppError, badRequest } from './errors.js'

/** Keys are remembered for 24 hours (API-Requirements section 2). */
const KEY_LIFETIME_MS = 24 * 60 * 60 * 1000

export interface IdempotentResult {
  status: number
  body: unknown
}

/**
 * Makes a money-moving POST safe to send twice (API-Requirements section 10, US-14.8). The first request with an
 * `Idempotency-Key` does the work and its answer is kept; a repeat with the same key returns that answer instead of
 * creating a second visit, payment or reversal. The same key with different content is refused, and a repeat that
 * arrives while the first is still running is told to wait. Failures are not kept, so the user can correct and retry.
 * Without the header the request simply runs (the app always sends one).
 */
export async function idempotent(
  req: Request,
  run: () => Promise<IdempotentResult>,
): Promise<IdempotentResult & { replayed: boolean }> {
  const key = req.header('Idempotency-Key')
  if (key === undefined) return { ...(await run()), replayed: false }
  if (key.length < 8 || key.length > 100) throw badRequest('The Idempotency-Key header must be 8 to 100 characters.')

  const auth = requireAuthContext(req)
  const db = tenantDbFor(req)
  const requestHash = createHash('sha256')
    .update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(req.body ?? null)}`)
    .digest('hex')

  // An expired key is forgotten, so it can be used again.
  await db.idempotencyKey.deleteMany({
    where: { userId: auth.userId, key, createdAt: { lt: new Date(Date.now() - KEY_LIFETIME_MS) } },
  })

  let rowId: string
  try {
    const row = await db.idempotencyKey.create({
      data: { userId: auth.userId, key, requestHash } as Prisma.IdempotencyKeyUncheckedCreateInput,
      select: { id: true },
    })
    rowId = row.id
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const existing = await db.idempotencyKey.findFirst({
      where: { userId: auth.userId, key },
      select: { requestHash: true, responseStatus: true, responseBody: true },
    })
    if (!existing) throw error
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        422,
        'IDEMPOTENCY_KEY_REUSED',
        'This request key was already used for a different request. Please try again.',
      )
    }
    if (existing.responseStatus === null) {
      throw new AppError(
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'The first attempt is still being saved. Wait a moment and check before trying again.',
      )
    }
    return { status: existing.responseStatus, body: existing.responseBody, replayed: true }
  }

  let result: IdempotentResult
  try {
    result = await run()
  } catch (error) {
    await db.idempotencyKey.deleteMany({ where: { id: rowId } })
    throw error
  }
  await db.idempotencyKey.updateMany({
    where: { id: rowId },
    data: {
      responseStatus: result.status,
      // Dates and decimals become the same JSON the client received the first time.
      responseBody: JSON.parse(JSON.stringify(result.body ?? null)) as Prisma.InputJsonValue,
    },
  })
  return { ...result, replayed: false }
}
