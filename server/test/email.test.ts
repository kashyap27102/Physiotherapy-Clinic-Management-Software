import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { createBrevoSender, parseSender } from '../src/lib/email/brevo.js'
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

describe('Brevo sender', () => {
  const brevo = (fetchFn: typeof fetch) =>
    createBrevoSender({ apiKey: 'xkeysib-test', from: 'Clinic <sender@example.test>', fetchFn })

  it('posts the message with the api-key header and the sender split into name and address', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ messageId: '<1@brevo>' }))
    await brevo(fetchFn).send(message, 'otp')

    const [url, init] = fetchFn.mock.calls[0]!
    const request = init as RequestInit
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect((request.headers as Record<string, string>)['api-key']).toBe('xkeysib-test')
    expect(JSON.parse(request.body as string)).toEqual({
      sender: { name: 'Clinic', email: 'sender@example.test' },
      to: [{ email: 'someone@example.test' }],
      subject: 'Hello',
      textContent: 'Body',
    })
  })

  it('answers 503 when the provider rejects the message or cannot be reached', async () => {
    const rejected = await brevo(vi.fn<typeof fetch>(async () => Response.json({ message: 'secret' }, { status: 401 })))
      .send(message)
      .catch((e: unknown) => e)
    expect((rejected as AppError).status).toBe(503)
    expect((rejected as AppError).message).not.toContain('secret')

    const down = await brevo(
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('network down')
      }),
    )
      .send(message)
      .catch((e: unknown) => e)
    expect((down as AppError).status).toBe(503)
  })

  it('reads the sender as a bare address or as a name with an address', () => {
    expect(parseSender('a@b.test')).toEqual({ email: 'a@b.test' })
    expect(parseSender('Clinic Software <a@b.test>')).toEqual({ name: 'Clinic Software', email: 'a@b.test' })
    expect(parseSender('"Clinic, Pune" <a@b.test>')).toEqual({ name: 'Clinic, Pune', email: 'a@b.test' })
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
    const env = loadEnv({ NODE_ENV: 'test', RESEND_API_KEY: '', BREVO_API_KEY: '', EMAIL_FROM: '' })
    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.BREVO_API_KEY).toBeUndefined()
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
