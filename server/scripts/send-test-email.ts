// Manual check of the Resend setup: npm run email:test -- you@example.com
// Sends one real email using RESEND_API_KEY and EMAIL_FROM from .env. Until a domain is verified in Resend,
// the only recipient it accepts is the Resend account owner's own address.
import { getEmailSender } from '../src/lib/email/index.js'
import { otpEmail } from '../src/lib/email/templates.js'

const to = process.argv[2]
if (!to?.includes('@')) {
  console.error('Usage: npm run email:test -- <recipient email>')
  process.exit(1)
}

await getEmailSender().send(otpEmail(to, '123456', 10), 'otp')
console.log('Sent. Check the inbox (and spam) of', to)
