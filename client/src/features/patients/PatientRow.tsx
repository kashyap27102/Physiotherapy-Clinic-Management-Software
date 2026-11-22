import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PatientListItem } from '@/api'
import { Avatar } from '@/components/common/Avatar'
import { BalanceBadge } from '@/components/common/Balance'
import { formatDate } from '@/lib/date'
import { formatPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

interface PatientRowProps {
  patient: PatientListItem
  /** Rows inside a dialog or card get no hover chevron and open in the same tab. */
  className?: string
  /** Called after the link is clicked, for example to close a dialog. */
  onOpen?: () => void
}

/** One patient in a list: avatar, name, age · gender · phone, last visit, balance. The whole row opens the profile. */
export function PatientRow({ patient, className, onOpen }: PatientRowProps) {
  return (
    <Link
      to={`/patients/${patient.id}`}
      onClick={onOpen}
      className={cn(
        'group flex items-center gap-3.5 px-4 py-3.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 sm:px-5',
        className,
      )}
    >
      <Avatar name={patient.fullName} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium group-hover:text-primary">{patient.fullName}</div>
        <div className="truncate text-sm text-muted-foreground">
          {t.patient.ageYears(patient.age)} · {t.patient.gender[patient.gender]} · {formatPhone(patient.phone)}
        </div>
        <div className="truncate text-xs text-muted-foreground/80">
          {patient.registeredBranch.name} ·{' '}
          {patient.lastVisitAt
            ? `${t.home.lastVisit}: ${formatDate(patient.lastVisitAt)}${patient.lastVisitBranch ? ` · ${patient.lastVisitBranch}` : ''}`
            : t.home.neverVisited}
        </div>
      </div>
      <BalanceBadge balance={patient.balance} />
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  )
}
