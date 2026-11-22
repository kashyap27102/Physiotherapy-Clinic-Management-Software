// Manual check of the email setup (Brevo or Resend): npm run email:test -- you@example.com
// Sends one real email using BREVO_API_KEY (or RESEND_API_KEY) and EMAIL_FROM from .env. With Resend and no
// verified domain, the only recipient it accepts is the account owner's own address.
import { getEmailSender } from '../src/lib/email/index.js'
import { otpEmail } from '../src/lib/email/templates.js'

const to = process.argv[2]
if (!to?.includes('@')) {
  console.error('Usage: npm run email:test -- <recipient email>')
  process.exit(1)
}

await getEmailSender().send(otpEmail(to, '123456', 10), 'otp')
console.log('Sent. Check the inbox (and spam) of', to)
