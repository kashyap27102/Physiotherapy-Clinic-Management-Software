import { createBrowserRouter } from 'react-router-dom'
import { RequireAuth, RequirePermission, RequireSetupComplete } from '@/auth/guards'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PatientProfilePage } from '@/pages/PatientProfilePage'
import { RegisterPage } from '@/pages/RegisterPage'
import { RegisterPatientPage } from '@/pages/RegisterPatientPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { SecurityPage } from '@/pages/SecurityPage'
import { SetupPage } from '@/pages/SetupPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Clinic self-registration (TEN-001).
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  // The emailed reset link (AUTH-004) points here; it works whether or not someone is signed in.
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      // First-branch step for a newly registered clinic; full screen, outside the app shell.
      { path: 'setup', element: <SetupPage /> },
      {
        element: <RequireSetupComplete />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                index: true,
                element: (
                  <RequirePermission permission="patient.view">
                    <HomePage />
                  </RequirePermission>
                ),
              },
              {
                path: 'patients/new',
                element: (
                  <RequirePermission permission="patient.register">
                    <RegisterPatientPage />
                  </RequirePermission>
                ),
              },
              {
                path: 'patients/:id',
                element: (
                  <RequirePermission permission="patient.view">
                    <PatientProfilePage />
                  </RequirePermission>
                ),
              },
              {
                path: 'dashboard',
                element: (
                  <RequirePermission permission="report.view">
                    <DashboardPage />
                  </RequirePermission>
                ),
              },
              { path: 'account/security', element: <SecurityPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
