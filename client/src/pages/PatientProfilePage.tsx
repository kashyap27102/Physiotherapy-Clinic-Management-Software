import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, ClipboardList, CreditCard, IndianRupee, Target, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, isApiError } from '@/api'
import { useCan } from '@/auth/hooks'
import { BalanceBanner } from '@/components/common/Balance'
import { SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RecordPaymentDialog } from '@/features/billing/RecordPaymentDialog'
import { OverviewTab, PaymentsTab, TreatmentTab, VisitsTab } from '@/features/patients/PatientTabs'
import { MarkAttendanceDialog } from '@/features/visits/MarkAttendanceDialog'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

// Underlined tab style from the reference design.
const tabListClass = 'group-data-horizontal/tabs:h-11 mb-6 w-full justify-start gap-2 overflow-x-auto rounded-none border-b p-0'
const tabClass =
  'h-full flex-none px-3 data-active:text-primary group-data-horizontal/tabs:after:-bottom-px group-data-[variant=line]/tabs-list:after:bg-primary'

export function PatientProfilePage() {
  const { id = '' } = useParams()
  const canAttend = useCan('visit.mark')
  const canPay = useCan('payment.record')
  const [attendOpen, setAttendOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const patientQuery = useQuery({
    queryKey: queryKeys.patient(id),
    queryFn: () => api.patients.get(id),
    retry: (count, error) => !isApiError(error, 'NOT_FOUND') && count < 2,
  })
  const patient = patientQuery.data

  if (patientQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (patientQuery.isError || !patient) {
    return (
      <>
        <PageHeader crumbs={[{ label: t.nav.patients, to: '/' }, { label: t.patient.notFound }]} />
        <Alert variant="destructive" className="max-w-xl">
          <AlertDescription>{t.patient.notFound}</AlertDescription>
        </Alert>
        <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-4 h-10 px-4' })}>
          {t.common.back}
        </Link>
      </>
    )
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: t.nav.patients, to: '/' }, { label: patient.fullName }]}
        badge={<SoftPill tone={patient.status === 'active' ? 'success' : 'muted'}>{t.patient.status[patient.status]}</SoftPill>}
        actions={
          <>
            {canPay && (
              <Button variant="outline" className="h-10 gap-1.5 px-4" onClick={() => setPayOpen(true)}>
                <IndianRupee aria-hidden />
                {t.home.takePayment}
              </Button>
            )}
            {canAttend && (
              <Button className="h-10 gap-1.5 px-4" onClick={() => setAttendOpen(true)}>
                <CalendarCheck aria-hidden />
                {t.home.markAttendance}
              </Button>
            )}
          </>
        }
      />

      <p className="-mt-3 mb-5 text-sm text-muted-foreground">
        {t.patient.ageYears(patient.age)} · {t.patient.gender[patient.gender]} · {patient.phone}
      </p>

      {patient.balance && (
        <div className="mb-6 max-w-sm">
          <BalanceBanner balance={patient.balance} />
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList variant="line" className={tabListClass}>
          <TabsTrigger value="overview" className={tabClass}>
            <UserRound aria-hidden />
            {t.patient.tabs.overview}
          </TabsTrigger>
          <TabsTrigger value="treatment" className={tabClass}>
            <Target aria-hidden />
            {t.patient.tabs.treatment}
          </TabsTrigger>
          <TabsTrigger value="visits" className={tabClass}>
            <ClipboardList aria-hidden />
            {t.patient.tabs.visits}
          </TabsTrigger>
          <TabsTrigger value="payments" className={tabClass}>
            <CreditCard aria-hidden />
            {t.patient.tabs.payments}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab patient={patient} />
        </TabsContent>
        <TabsContent value="treatment">
          <TreatmentTab patientId={patient.id} />
        </TabsContent>
        <TabsContent value="visits">
          <VisitsTab patientId={patient.id} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab patientId={patient.id} />
        </TabsContent>
      </Tabs>

      <MarkAttendanceDialog patientId={patient.id} open={attendOpen} onOpenChange={setAttendOpen} />
      <RecordPaymentDialog patientId={patient.id} open={payOpen} onOpenChange={setPayOpen} />
    </>
  )
}
