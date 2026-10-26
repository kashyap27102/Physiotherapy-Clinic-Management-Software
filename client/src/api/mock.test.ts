// Time zone is pinned to Asia/Kolkata in vitest.config.ts: the seed data puts visits "today" in India time.
import { beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import { mockApi as api } from './mock'

async function signIn(email: string) {
  const login = await api.auth.login(email, 'demo1234')
  if (login.status === 'ok') return login.user
  return api.auth.verifyOtp({ challengeId: login.challengeId, code: '123456', trustDevice: false })
}

async function expectError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code)
}

async function findPatient(q: string) {
  const patient = (await api.patients.search({ q })).items[0]
  if (!patient) throw new Error(`seed patient missing: ${q}`)
  return patient
}

describe('mock backend business rules', () => {
  beforeAll(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('asks for an email code on a new device and rejects a wrong code', async () => {
    const login = await api.auth.login('reception@demo.clinic', 'demo1234')
    expect(login.status).toBe('otp_required')
    if (login.status !== 'otp_required') return
    await expectError(
      api.auth.verifyOtp({ challengeId: login.challengeId, code: '000000', trustDevice: false }),
      'OTP_INVALID',
    )
    await expectError(api.auth.login('reception@demo.clinic', 'wrong'), 'INVALID_CREDENTIALS')
  })

  it('computes balances from the ledger and flows attendance, dues warning and payment', async () => {
    await signIn('reception@demo.clinic')
    const ravi = await findPatient('ravi')
    expect(ravi.balance).toEqual({ amount: '1000.00', state: 'due' })
    expect((await findPatient('9890055566')).balance).toEqual({ amount: '1000.00', state: 'credit' })

    // Ravi was already seen today: a second session needs explicit confirmation.
    await expectError(api.visits.create({ patientId: ravi.id }, crypto.randomUUID()), 'DUPLICATE_VISIT_TODAY')
    const key = crypto.randomUUID()
    const visit = await api.visits.create({ patientId: ravi.id, confirmSecondVisitToday: true }, key)
    expect(visit.duesWarning).toEqual({ amount: '1000.00' }) // warns, never blocks
    expect(visit.balanceAfter).toEqual({ amount: '1500.00', state: 'due' })
    expect(visit.planProgress).toEqual({ planned: 10, planExceeded: false })

    // Retrying with the same idempotency key must not charge twice.
    const retry = await api.visits.create({ patientId: ravi.id, confirmSecondVisitToday: true }, key)
    expect(retry.visit.id).toBe(visit.visit.id)
    expect((await api.patients.get(ravi.id)).balance).toEqual({ amount: '1500.00', state: 'due' })

    // Pay in full: numbered receipt per branch and financial year, balance settled.
    const payKey = crypto.randomUUID()
    const paid = await api.payments.create({ patientId: ravi.id, amount: '1500.00', method: 'cash' }, payKey)
    expect(paid.receipt.number).toMatch(/^MUM\/\d{4}-\d{2}\/\d{4}$/)
    expect(paid.balanceAfter.state).toBe('zero')
    const again = await api.payments.create({ patientId: ravi.id, amount: '1500.00', method: 'cash' }, payKey)
    expect(again.receipt.number).toBe(paid.receipt.number)

    // Advance payments become credit.
    const advance = await api.payments.create(
      { patientId: ravi.id, amount: '2500', method: 'upi' },
      crypto.randomUUID(),
    )
    expect(advance.balanceAfter).toEqual({ amount: '2500.00', state: 'credit' })
  })

  it('validates payments', async () => {
    await signIn('reception@demo.clinic')
    const ravi = await findPatient('ravi')
    await expectError(
      api.payments.create({ patientId: ravi.id, amount: '0', method: 'cash' }, crypto.randomUUID()),
      'VALIDATION_FAILED',
    )
    await expectError(
      api.payments.create({ patientId: ravi.id, amount: '100', method: 'bank_transfer' }, crypto.randomUUID()),
      'VALIDATION_FAILED',
    )
  })

  it('enforces permissions on the server side', async () => {
    await signIn('reception@demo.clinic')
    const kiran = await findPatient('kiran')
    const ravi = await findPatient('ravi')
    // Receptionist has no fee.override and no episode.manage by default.
    await expectError(
      api.visits.create(
        { patientId: ravi.id, confirmSecondVisitToday: true, feeOverride: { amount: '300', reason: 'discount' } },
        crypto.randomUUID(),
      ),
      'PERMISSION_DENIED',
    )
    await expectError(api.episodes.start(kiran.id), 'PERMISSION_DENIED')
    await expectError(api.visits.create({ patientId: kiran.id }, crypto.randomUUID()), 'NO_ACTIVE_EPISODE')

    // A physiotherapist can start the episode; then attendance works.
    await signIn('therapist@demo.clinic')
    await api.episodes.start(kiran.id)
    await signIn('reception@demo.clinic')
    const visit = await api.visits.create({ patientId: kiran.id }, crypto.randomUUID())
    expect(visit.sessionNumber).toBe(1)
  })

  it('hides money from roles without permission', async () => {
    await signIn('therapist@demo.clinic')
    const ravi = await findPatient('ravi')
    expect(ravi.balance).toBeNull() // therapist default has no ledger.view
    await expectError(
      api.payments.create({ patientId: ravi.id, amount: '100', method: 'cash' }, crypto.randomUUID()),
      'PERMISSION_DENIED',
    )
    await expectError(api.patients.ledger(ravi.id), 'PERMISSION_DENIED')
  })

  it('warns about duplicate phone numbers and validates registration', async () => {
    await signIn('reception@demo.clinic')
    const base = { fullName: 'Test Patient', phone: '98200 11122', age: 30, gender: 'male' as const }
    await expectError(api.patients.create(base), 'DUPLICATE_PATIENT_WARNING')
    const created = await api.patients.create(base, { confirmDuplicate: true })
    expect(created.phone).toBe('9820011122')
    await expectError(api.patients.create({ ...base, phone: '123', age: 200, fullName: ' ' }), 'VALIDATION_FAILED')
  })
})
