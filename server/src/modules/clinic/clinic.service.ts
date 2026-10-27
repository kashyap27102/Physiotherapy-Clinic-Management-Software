import type { AuthContext } from '../../auth/context.js'
import { updateClinicProfile, type ClinicProfileChanges, type TenantDb } from '../../db/tenantScope.js'
import { AppError, notFound } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'

export const LOGO_MAX_BYTES = 200 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type LogoType = (typeof LOGO_TYPES)[number]

export interface ClinicView {
  id: string
  name: string
  phone: string | null
  address: string | null
  /** Printed on receipts: registration number, GSTIN or similar (PRD A-4). */
  registrationDetails: string | null
  inactiveAfterDays: number
  /** Changes whenever the logo does, so the browser refetches it. Null when there is no logo. */
  logoVersion: string | null
}

const select = {
  id: true,
  name: true,
  phone: true,
  address: true,
  registrationDetails: true,
  inactiveAfterDays: true,
  logo: { select: { updatedAt: true } },
} as const

type Row = {
  id: string
  name: string
  phone: string | null
  address: string | null
  registrationDetails: string | null
  inactiveAfterDays: number
  logo: { updatedAt: Date } | null
}

const toView = (row: Row): ClinicView => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  address: row.address,
  registrationDetails: row.registrationDetails,
  inactiveAfterDays: row.inactiveAfterDays,
  logoVersion: row.logo ? String(row.logo.updatedAt.getTime()) : null,
})

export async function getClinic(db: TenantDb): Promise<ClinicView> {
  // The tenant client only ever sees the signed-in user's own clinic row.
  const row = await db.tenant.findFirst({ select })
  if (!row) throw notFound('Clinic not found.')
  return toView(row)
}

/** PATCH /clinic (TEN-001). Old receipts are unaffected: they keep the details they were issued with (US-04a.1). */
export async function updateClinic(
  db: TenantDb,
  auth: AuthContext,
  changes: ClinicProfileChanges,
  ip: string | undefined,
): Promise<ClinicView> {
  const before = await getClinic(db)
  await updateClinicProfile(before.id, changes)
  const after = await getClinic(db)

  const changed = (Object.keys(changes) as (keyof ClinicProfileChanges)[]).filter((key) => before[key] !== after[key])
  if (changed.length > 0) {
    await recordAudit({
      action: 'clinic.updated',
      tenantId: auth.tenantId,
      userId: auth.userId,
      targetType: 'tenant',
      targetId: before.id,
      details: {
        before: Object.fromEntries(changed.map((key) => [key, before[key]])),
        after: Object.fromEntries(changed.map((key) => [key, after[key]])),
      },
      ip,
    })
  }
  return after
}

/** The image type, judged by the file's own first bytes rather than what the client claims. */
export function sniffImageType(data: Buffer): LogoType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/** POST /clinic/logo (US-04a.2): only real PNG, JPEG or WebP images up to 200 KB. */
export async function saveLogo(
  db: TenantDb,
  auth: AuthContext,
  data: Buffer,
  ip: string | undefined,
): Promise<ClinicView> {
  if (data.length === 0) throw new AppError(400, 'BAD_REQUEST', 'Choose an image to upload.')
  if (data.length > LOGO_MAX_BYTES) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The logo is too large. Use an image under 200 KB.')
  }
  const contentType = sniffImageType(data)
  if (!contentType) throw new AppError(400, 'BAD_REQUEST', 'The logo must be a PNG, JPEG or WebP image.')

  const now = new Date()
  const { id } = await getClinic(db)
  await db.tenantLogo.upsert({
    where: { tenantId: id },
    create: { contentType, data: new Uint8Array(data), updatedAt: now } as never,
    update: { contentType, data: new Uint8Array(data), updatedAt: now },
  })
  await recordAudit({
    action: 'clinic.logo_changed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    details: { bytes: data.length },
    ip,
  })
  return getClinic(db)
}

export async function removeLogo(db: TenantDb, auth: AuthContext, ip: string | undefined): Promise<ClinicView> {
  await db.tenantLogo.deleteMany({})
  await recordAudit({
    action: 'clinic.logo_changed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    details: { removed: true },
    ip,
  })
  return getClinic(db)
}

/** GET /clinic/logo: the signed-in user's own clinic logo, or 404. */
export async function readLogo(db: TenantDb): Promise<{ contentType: string; data: Buffer }> {
  const logo = await db.tenantLogo.findFirst({ select: { contentType: true, data: true } })
  if (!logo) throw notFound('No logo.')
  return { contentType: logo.contentType, data: Buffer.from(logo.data) }
}
