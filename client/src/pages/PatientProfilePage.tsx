import { useQuery } from '@tanstack/react-query'
import {
  Banknote,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  Pencil,
  Phone,
  Building2,
  Target,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, isApiError } from '@/api'
import { Can } from '@/auth/guards'
import { useCan } from '@/auth/hooks'
import { Avatar } from '@/components/common/Avatar'
import { BalanceBanner } from '@/components/common/Balance'
import { EmptyState } from '@/components/common/EmptyState'
import { SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EditPatientDialog } from '@/features/patients/EditPatientDialog'
import { TreatmentTab } from '@/features/clinical/TreatmentTab'
import { PaymentsTab } from '@/features/billing/PaymentsTab'
import { RecordPaymentDialog } from '@/features/billing/RecordPaymentDialog'
import { OverviewTab } from '@/features/patients/PatientTabs'
import { MarkAttendanceDialog } from '@/features/visits/MarkAttendanceDialog'
import { VisitsTab } from '@/features/visits/VisitsTab'
import { formatDate } from '@/lib/date'
import { formatPhone } from '@/lib/phone'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

// Underlined tab style from the reference design.
const tabListClass =
  'group-data-horizontal/tabs:h-11 mb-6 w-full justify-start gap-2 overflow-x-auto rounded-none border-b p-0'
const tabClass =
  'h-full flex-none px-3 data-active:text-primary group-data-horizontal/tabs:after:-bottom-px group-data-[variant=line]/tabs-list:after:bg-primary'

/** PAT-003: one page with the patient's details, balance and history. Every open is audited by the server. */
export function PatientProfilePage() {
  const { id = '' } = useParams()
  const canEdit = useCan('patient.edit')
  const canSeeClinical = useCan('clinical.view')
  const canSeeLedger = useCan('ledger.view')
  const canMark = useCan('visit.mark')
  const canPay = useCan('payment.record')
  const [editing, setEditing] = useState(false)
  const [marking, setMarking] = useState(false)
  const [paying, setPaying] = useState(false)

  const query = useQuery({
    queryKey: queryKeys.patient(id),
    queryFn: () => api.patients.get(id),
    retry: (count, error) => !isApiError(error, 'NOT_FOUND') && count < 2,
    // Each fetch is a recorded "view", so do not refetch just because the window regained focus or remounted.
    staleTime: 60_000,
  })
  const patient = query.data

  if (query.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  if (query.isError || !patient) {
    const notFound = isApiError(query.error, 'NOT_FOUND')
    return (
      <>
        <PageHeader crumbs={[{ label: t.nav.patients, to: '/' }, { label: t.patient.notFound }]} />
        <div className="max-w-xl rounded-xl border bg-card">
          <EmptyState
            icon={UserRound}
            action={
              <Link to="/" className={buttonVariants({ variant: 'outline', className: 'h-10 px-4' })}>
                {t.register.back}
              </Link>
            }
          >
            {notFound ? t.patient.notFoundBody : t.common.genericError}
          </EmptyState>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader crumbs={[{ label: t.nav.patients, to: '/' }, { label: patient.fullName }]} />

      <section className="mb-6 grid gap-5 rounded-xl border bg-card p-5 shadow-xs md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={patient.fullName} className="size-16 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">{patient.fullName}</h2>
              <SoftPill tone={patient.status === 'active' ? 'success' : 'muted'}>
                {t.patient.status[patient.status]}
              </SoftPill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.patient.ageYears(patient.age)} · {t.patient.gender[patient.gender]}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden />
                {formatPhone(patient.phone)}
                {patient.phoneContactType === 'guardian' && <span>({t.patient.guardianNumber.toLowerCase()})</span>}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" aria-hidden />
                {t.patient.registeredOn(patient.registeredBranch, formatDate(patient.createdAt))}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Can permission="visit.mark">
                <Button className="h-10 gap-1.5 px-4" onClick={() => setMarking(true)}>
                  <CalendarCheck aria-hidden />
                  {t.visit.markAttendance}
                </Button>
              </Can>
              <Can permission="payment.record">
                <Button variant="outline" className="h-10 gap-1.5 px-4" onClick={() => setPaying(true)}>
                  <Banknote aria-hidden />
                  {t.visit.recordPayment}
                </Button>
              </Can>
              <Can permission="patient.edit">
                <Button variant="outline" className="h-10 gap-1.5 px-3" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  {t.patient.edit}
                </Button>
              </Can>
            </div>
          </div>
        </div>

        {/* PAT-003 / BILL-008: the balance or advance credit is the first thing the front desk needs to see. */}
        {patient.balance && (
          <div className="md:w-64">
            <BalanceBanner balance={patient.balance} />
          </div>
        )}
      </section>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className={tabListClass}>
          <TabsTrigger value="overview" className={tabClass}>
            <UserRound aria-hidden />
            {t.patient.tabs.overview}
          </TabsTrigger>
          {canSeeClinical && (
            <TabsTrigger value="treatment" className={tabClass}>
              <Target aria-hidden />
              {t.patient.tabs.treatment}
            </TabsTrigger>
          )}
          <TabsTrigger value="visits" className={tabClass}>
            <ClipboardList aria-hidden />
            {t.patient.tabs.visits}
          </TabsTrigger>
          {canSeeLedger && (
            <TabsTrigger value="payments" className={tabClass}>
              <CreditCard aria-hidden />
              {t.patient.tabs.payments}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab patient={patient} />
        </TabsContent>
        {canSeeClinical && (
          <TabsContent value="treatment">
            <TreatmentTab patient={patient} />
          </TabsContent>
        )}
        <TabsContent value="visits">
          <VisitsTab patient={patient} />
        </TabsContent>
        {canSeeLedger && (
          <TabsContent value="payments">
            <PaymentsTab patient={patient} />
          </TabsContent>
        )}
      </Tabs>

      {canEdit && <EditPatientDialog patient={patient} open={editing} onOpenChange={setEditing} />}
      {canMark && <MarkAttendanceDialog patientId={patient.id} open={marking} onOpenChange={setMarking} />}
      {canPay && <RecordPaymentDialog patientId={patient.id} open={paying} onOpenChange={setPaying} />}
    </>
  )
}
