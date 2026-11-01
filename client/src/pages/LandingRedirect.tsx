import { Navigate } from 'react-router-dom'
import { useAnyCan } from '@/auth/hooks'

/**
 * Where "/" leads after sign-in (US-01.1): everyone who can see patients lands on the dashboard, which gives each role
 * its own quick actions and today's visits (the KPI tiles need `report.view`, the money lives on `/finance`). Anyone else
 * lands on the patient list. Patients have their own address, `/patients`.
 */
export function LandingRedirect() {
  const canSeeDashboard = useAnyCan('patient.view', 'report.view')
  return <Navigate to={canSeeDashboard ? '/dashboard' : '/patients'} replace />
}
