import { Navigate } from 'react-router-dom'
import { useCan } from '@/auth/hooks'

/**
 * Where "/" leads after sign-in (US-01.1): the owner, or anyone who may see reports, lands on the dashboard; everyone
 * else, such as a receptionist or physiotherapist, lands on the patient list. Patients have their own address, `/patients`.
 */
export function LandingRedirect() {
  const canSeeDashboard = useCan('report.view')
  return <Navigate to={canSeeDashboard ? '/dashboard' : '/patients'} replace />
}
