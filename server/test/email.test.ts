import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { getEmailSender, setEmailSender } from '../src/lib/email/index.js'
import { createResendSender } from '../src/lib/email/resend.js'
import { invitationEmail, otpEmail, passwordResetEmail } from '../src/lib/email/templates.js'
import { AppError } from '../src/lib/errors.js'

const message = { to: 'someone@example.test', subject: 'Hello', text: 'Body' }

function sender(fetchFn: typeof fetch) {
  return createResendSender({ apiKey: 're_test_key', from: 'Clinic <no-reply@example.test>', fetchFn })
}

describe('Resend sender', () => {
  it('posts the message with the bearer key and the configured sender', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ id: 'msg_1' }))
    await sender(fetchFn).send(message, 'otp')

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]!
    const request = init as RequestInit
    expect(url).toBe('https://api.resend.com/emails')
    expect((request.headers as Record<string, string>)['Authorization']).toBe('Bearer re_test_key')
    expect(JSON.parse(request.body as string)).toEqual({
      from: 'Clinic <no-reply@example.test>',
      to: ['someone@example.test'],
      subject: 'Hello',
      text: 'Body',
    })
  })

  it('answers 503 when the provider rejects the message, without leaking provider details', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ message: 'secret detail' }, { status: 422 }))
    const error = await sender(fetchFn)
      .send(message)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(503)
    expect((error as AppError).message).not.toContain('secret detail')
  })

  it('answers 503 when the provider cannot be reached', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network down')
    })
    const error = await sender(fetchFn)
      .send(message)
      .catch((e: unknown) => e)
    expect((error as AppError).status).toBe(503)
  })
})

describe('email configuration', () => {
  it('answers 503 SERVICE_UNAVAILABLE when email is not configured', async () => {
    setEmailSender(undefined)
    const error = await getEmailSender()
      .send(message)
      .catch((e: unknown) => e)
    expect((error as AppError).code).toBe('SERVICE_UNAVAILABLE')
  })

  it('can be replaced in tests', async () => {
    const send = vi.fn(async () => {})
    setEmailSender({ send })
    await getEmailSender().send(message)
    expect(send).toHaveBeenCalledOnce()
    setEmailSender(undefined)
  })

  it('treats empty values as not set', () => {
    const env = loadEnv({ NODE_ENV: 'test', RESEND_API_KEY: '', EMAIL_FROM: '' })
    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.EMAIL_FROM).toBeUndefined()
  })
})

describe('templates', () => {
  it('put the code, link and expiry in the message', () => {
    expect(otpEmail('a@b.test', '482913', 10).text).toContain('482913')
    expect(passwordResetEmail('a@b.test', 'https://app.test/reset?t=x', 30).text).toContain(
      'https://app.test/reset?t=x',
    )
    const invite = invitationEmail('a@b.test', 'Sunrise Physio', 'https://app.test/i?t=y', 7)
    expect(invite.subject).toContain('Sunrise Physio')
    expect(invite.text).toContain('7 days')
  })
})
