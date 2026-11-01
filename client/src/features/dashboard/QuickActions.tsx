import { Banknote, CalendarCheck, ListChecks, UserRoundPlus, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCan } from '@/auth/hooks'
import { RecordPaymentDialog } from '@/features/billing/RecordPaymentDialog'
import { BulkPatientsDialog } from '@/features/visits/BulkPatientsDialog'
import { MarkAttendanceDialog } from '@/features/visits/MarkAttendanceDialog'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { PatientPickDialog } from './PatientPickDialog'

const tile =
  'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-3 text-center text-sm font-medium shadow-xs outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted sm:min-h-24'

function Icon({ icon: Glyph, primary }: { icon: LucideIcon; primary?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-9 items-center justify-center rounded-lg',
        primary ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground',
      )}
    >
      <Glyph className="size-5" aria-hidden />
    </span>
  )
}

/**
 * The few things done all day, one tap from the dashboard. Each shows only with its permission. Attendance and payment
 * ask for the patient first, then open the same dialog as the patient profile. Registering opens the register form.
 */
export function QuickActions() {
  const canMark = useCan('visit.mark')
  const canPay = useCan('payment.record')
  const canRegister = useCan('patient.register')
  const canBulk = useCan('visit.bulk')
  const [picking, setPicking] = useState<'mark' | 'pay' | null>(null)
  const [marking, setMarking] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  if (!canMark && !canPay && !canRegister && !canBulk) return null

  return (
    <section aria-label={t.dashboard.quick.title} className="mb-5 sm:mb-6">
      <h2 className="sr-only">{t.dashboard.quick.title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {canRegister && (
          <Link to="/patients/new" className={tile}>
            <Icon icon={UserRoundPlus} primary />
            {t.dashboard.quick.registerPatient}
          </Link>
        )}
        {canMark && (
          <button type="button" className={tile} onClick={() => setPicking('mark')}>
            <Icon icon={CalendarCheck} primary />
            {t.dashboard.quick.markAttendance}
          </button>
        )}
        {canPay && (
          <button type="button" className={tile} onClick={() => setPicking('pay')}>
            <Icon icon={Banknote} />
            {t.dashboard.quick.recordPayment}
          </button>
        )}
        {canBulk && (
          <button type="button" className={tile} onClick={() => setBulkOpen(true)}>
            <Icon icon={ListChecks} />
            {t.dashboard.quick.bulkAttendance}
          </button>
        )}
      </div>

      <PatientPickDialog
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        title={picking === 'pay' ? t.dashboard.quick.pickPayTitle : t.dashboard.quick.pickMarkTitle}
        onPick={(patientId) => {
          if (picking === 'mark') setMarking(patientId)
          else setPaying(patientId)
          setPicking(null)
        }}
      />
      {canMark && marking && (
        <MarkAttendanceDialog patientId={marking} open onOpenChange={(open) => !open && setMarking(null)} />
      )}
      {canPay && paying && (
        <RecordPaymentDialog patientId={paying} open onOpenChange={(open) => !open && setPaying(null)} />
      )}
      {canBulk && <BulkPatientsDialog open={bulkOpen} onOpenChange={setBulkOpen} />}
    </section>
  )
}
