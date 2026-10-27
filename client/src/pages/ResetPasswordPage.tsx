import { api } from '@/api'
import { SetPasswordScreen } from '@/components/auth/SetPasswordScreen'
import { t } from '@/strings/en'

/** AUTH-004 step 2: the page the emailed link opens (/reset-password?token=...). */
export function ResetPasswordPage() {
  return (
    <SetPasswordScreen
      title={t.reset.title}
      subtitle={t.reset.subtitle}
      submitLabel={t.reset.submit}
      submittingLabel={t.reset.submitting}
      doneTitle={t.reset.doneTitle}
      doneBody={t.reset.doneBody}
      invalidLinkText={t.reset.missingToken}
      requestNew={{ label: t.reset.requestNew, to: '/forgot-password' }}
      submit={(input) => api.auth.resetPassword(input)}
    />
  )
}
