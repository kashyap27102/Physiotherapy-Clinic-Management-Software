import { createBrowserRouter } from 'react-router-dom'
import { RequireAuth, RequirePermission } from '@/auth/guards'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PatientProfilePage } from '@/pages/PatientProfilePage'
import { RegisterPatientPage } from '@/pages/RegisterPatientPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
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
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
