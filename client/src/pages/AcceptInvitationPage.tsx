import { api } from '@/api'
import { SetPasswordScreen } from '@/components/auth/SetPasswordScreen'
import { t } from '@/strings/en'

/** USR-001: the link in a staff invitation (/accept-invitation?token=...). The person chooses their password. */
export function AcceptInvitationPage() {
  return (
    <SetPasswordScreen
      title={t.invitation.title}
      subtitle={t.invitation.subtitle}
      submitLabel={t.invitation.submit}
      submittingLabel={t.invitation.submitting}
      doneTitle={t.invitation.doneTitle}
      doneBody={t.invitation.doneBody}
      invalidLinkText={t.invitation.missingToken}
      submit={(input) => api.auth.acceptInvitation(input)}
    />
  )
}
