import type { Express } from 'express'
import request from 'supertest'
import { setEmailSender, type EmailMessage } from '../../src/lib/email/index.js'

/** Shared setup for database tests that need real clinics, owners and staff. Test data only (PRD REG-2). */

export const API = '/api/v1'
export const OWNER_PASSWORD = 'Quiet-River-Bends-31'
export const STAFF_PASSWORD = 'Amber-Lantern-Glows-52'

export interface Session {
  agent: ReturnType<typeof request.agent>
  csrf: string
}

/** Captures every email in memory so tests can read codes and links. */
export function captureEmail() {
  const inbox: EmailMessage[] = []
  setEmailSender({
    send(message) {
      inbox.push(message)
      return Promise.resolve()
    },
  })
  const last = (to: string): EmailMessage => {
    const found = [...inbox].reverse().find((m) => m.to === to)
    if (!found) throw new Error(`no email to ${to}`)
    return found
  }
  return { inbox, last }
}

export const codeIn = (message: EmailMessage) => /(\d{6})/.exec(message.text)![1]!
export const tokenIn = (message: EmailMessage) => /token=([\w-]+)/.exec(message.text)![1]!

export const post = (s: Session, path: string, body: object = {}) =>
  s.agent.post(`${API}${path}`).set('X-CSRF-Token', s.csrf).send(body)
export const patch = (s: Session, path: string, body: object) =>
  s.agent.patch(`${API}${path}`).set('X-CSRF-Token', s.csrf).send(body)

interface Env {
  app: Express
  /** Unique per test run, so parallel runs and leftovers never collide. */
  run: string
  last: (to: string) => EmailMessage
}

export const emailOf = (run: string, name: string) => `${name}-${run}@example.test`.toLowerCase()

/** Registers a clinic through the real flow and adds its first branch, as an owner would. */
export async function registerClinic(env: Env, name: string, branchCode: string) {
  const email = emailOf(env.run, `owner-${name}`)
  const agent = request.agent(env.app)
  const started = await agent.post(`${API}/auth/register`).send({
    clinicName: `Pat ${name} ${env.run}`,
    fullName: `Owner ${name}`,
    email,
    phone: '9876543210',
    password: OWNER_PASSWORD,
    acceptTerms: true,
  })
  const verified = await agent.post(`${API}/auth/register/verify`).send({
    registrationId: started.body.registrationId,
    code: codeIn(env.last(email)),
  })
  const owner: Session = { agent, csrf: verified.body.csrfToken as string }
  const branch = await post(owner, '/branches', { name: `${name} Main`, code: branchCode })
  return { owner, branchId: branch.body.id as string }
}

/** Invites a staff member, accepts the invitation, and signs them in on a fresh browser. */
export async function addAndSignInStaff(
  env: Env,
  owner: Session,
  name: string,
  role: 'receptionist' | 'physiotherapist',
  branchId: string,
): Promise<Session> {
  const email = emailOf(env.run, name)
  const created = await post(owner, '/users', { fullName: `Staff ${name}`, email, role, branchId })
  if (created.status !== 201) throw new Error(`could not invite ${name}: ${JSON.stringify(created.body)}`)
  await request(env.app)
    .post(`${API}/auth/invitation/accept`)
    .send({ token: tokenIn(env.last(email)), newPassword: STAFF_PASSWORD })

  const agent = request.agent(env.app)
  const login = await agent.post(`${API}/auth/login`).send({ email, password: STAFF_PASSWORD })
  const verified = await agent.post(`${API}/auth/otp/verify`).send({
    challengeId: login.body.error.details.challengeId,
    code: codeIn(env.last(email)),
  })
  return { agent, csrf: verified.body.csrfToken as string }
}
