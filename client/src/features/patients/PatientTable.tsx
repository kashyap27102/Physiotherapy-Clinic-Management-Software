import { Link, useNavigate } from 'react-router-dom'
import type { PatientListItem } from '@/api'
import { Avatar } from '@/components/common/Avatar'
import { BalanceBadge } from '@/components/common/Balance'
import { SoftPill } from '@/components/common/SectionCard'
import { formatDate } from '@/lib/date'
import { formatPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { PatientRow } from './PatientRow'

interface PatientTableProps {
  patients: PatientListItem[]
  /** Hidden when the list is already narrowed to one branch. */
  showBranch: boolean
  showBalance: boolean
  /** Dims the rows while the next page or filter loads, so the old rows do not pass for the answer. */
  stale?: boolean
}

const th =
  'px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase first:pl-5 last:pr-5'
const td = 'px-4 py-3 align-middle first:pl-5 last:pr-5'

/** PAT-002: the patient list. A table on wide screens; tappable cards on phones. Every row opens the profile. */
export function PatientTable({ patients, showBranch, showBalance, stale }: PatientTableProps) {
  const navigate = useNavigate()

  return (
    <div className={cn('transition-opacity', stale && 'opacity-60')}>
      <ul className="divide-y md:hidden">
        {patients.map((patient) => (
          <li key={patient.id}>
            <PatientRow patient={patient} />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={th}>{t.home.table.patient}</th>
              <th className={th}>{t.home.table.phone}</th>
              <th className={th}>{t.home.table.ageGender}</th>
              {showBranch && <th className={cn(th, 'hidden lg:table-cell')}>{t.home.table.branch}</th>}
              <th className={cn(th, 'hidden lg:table-cell')}>{t.home.table.registered}</th>
              <th className={cn(th, 'hidden xl:table-cell')}>{t.home.table.lastVisit}</th>
              {showBalance && <th className={cn(th, 'text-right')}>{t.home.table.balance}</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {patients.map((patient) => (
              <tr
                key={patient.id}
                // The name is the keyboard and screen-reader link; the rest of the row is a bigger mouse target.
                onClick={() => void navigate(`/patients/${patient.id}`)}
                className="group cursor-pointer transition-colors hover:bg-muted/50"
              >
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <Avatar name={patient.fullName} className="size-9 text-xs" muted={patient.status === 'inactive'} />
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        to={`/patients/${patient.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="truncate font-medium outline-none group-hover:text-primary focus-visible:underline"
                      >
                        {patient.fullName}
                      </Link>
                      {patient.status === 'inactive' && <SoftPill tone="muted">{t.home.table.inactive}</SoftPill>}
                    </div>
                  </div>
                </td>
                <td className={cn(td, 'whitespace-nowrap tabular-nums')}>
                  {formatPhone(patient.phone)}
                  {patient.phoneContactType === 'guardian' && (
                    <span className="ml-2 text-xs text-muted-foreground">({t.home.table.guardian})</span>
                  )}
                </td>
                <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>
                  {t.patient.ageYears(patient.age)} · {t.patient.gender[patient.gender]}
                </td>
                {showBranch && (
                  <td className={cn(td, 'hidden max-w-40 truncate lg:table-cell')}>{patient.registeredBranch.name}</td>
                )}
                <td className={cn(td, 'hidden whitespace-nowrap text-muted-foreground lg:table-cell')}>
                  {formatDate(patient.registeredAt)}
                </td>
                <td className={cn(td, 'hidden whitespace-nowrap text-muted-foreground xl:table-cell')}>
                  {patient.lastVisitAt ? formatDate(patient.lastVisitAt) : '—'}
                </td>
                {showBalance && (
                  <td className={cn(td, 'text-right')}>
                    <BalanceBadge balance={patient.balance} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
