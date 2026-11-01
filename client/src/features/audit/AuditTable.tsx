import { Link } from 'react-router-dom'
import type { AuditEntry } from '@/api'
import { Avatar } from '@/components/common/Avatar'
import { SoftPill } from '@/components/common/SectionCard'
import { formatDate, formatTime } from '@/lib/date'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { actionLabel, actionTone, summarize } from './auditSummary'

interface AuditTableProps {
  entries: AuditEntry[]
  /** Hidden when the log is already narrowed to one branch. */
  showBranch: boolean
  onOpen: (entry: AuditEntry) => void
  /** Dims the rows while the next page or filter loads, so the old rows do not pass for the answer. */
  stale?: boolean
}

const th =
  'px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase first:pl-5 last:pr-5'
const td = 'px-4 py-3 align-top first:pl-5 last:pr-5'

const personName = (entry: AuditEntry) => (entry.user ? (entry.user.fullName ?? t.audit.unknownUser) : t.audit.system)

function PatientLink({ entry }: { entry: AuditEntry }) {
  if (!entry.patient) return <span className="text-muted-foreground">–</span>
  return (
    <Link
      to={`/patients/${entry.patient.id}`}
      onClick={(event) => event.stopPropagation()}
      className="font-medium outline-none hover:text-primary focus-visible:underline"
    >
      {entry.patient.fullName ?? t.audit.unknownPatient}
    </Link>
  )
}

/** AUD-001: the log as a table on wide screens and tappable cards on phones. Every row opens its full details. */
export function AuditTable({ entries, showBranch, onOpen, stale }: AuditTableProps) {
  return (
    <div className={cn('transition-opacity', stale && 'opacity-60')}>
      <ul className="divide-y md:hidden">
        {entries.map((entry) => {
          const summary = summarize(entry.action, entry.details)
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onOpen(entry)}
                aria-label={`${t.audit.viewDetails}: ${actionLabel(entry.action)}`}
                className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SoftPill tone={actionTone(entry.action)}>{actionLabel(entry.action)}</SoftPill>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(entry.at)}, {formatTime(entry.at)}
                  </span>
                </span>
                <span className="text-sm">
                  <span className="font-medium">{personName(entry)}</span>
                  {entry.patient && (
                    <span className="text-muted-foreground"> · {entry.patient.fullName ?? t.audit.unknownPatient}</span>
                  )}
                </span>
                {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={th}>{t.audit.table.time}</th>
              <th className={th}>{t.audit.table.person}</th>
              <th className={th}>{t.audit.table.action}</th>
              <th className={th}>{t.audit.table.patient}</th>
              {showBranch && <th className={cn(th, 'hidden lg:table-cell')}>{t.audit.table.branch}</th>}
              <th className={cn(th, 'hidden xl:table-cell')}>{t.audit.table.details}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => (
              <tr
                key={entry.id}
                // The button in the action column is the keyboard and screen-reader way in; the row is a bigger mouse target.
                onClick={() => onOpen(entry)}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <td className={cn(td, 'whitespace-nowrap')}>
                  <div>{formatDate(entry.at)}</div>
                  <div className="text-xs text-muted-foreground">{formatTime(entry.at)}</div>
                </td>
                <td className={td}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={personName(entry)} className="size-8 text-xs" muted={!entry.user} />
                    <span className="max-w-40 truncate">{personName(entry)}</span>
                  </div>
                </td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(entry)
                    }}
                    className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label={`${t.audit.viewDetails}: ${actionLabel(entry.action)}`}
                  >
                    <SoftPill tone={actionTone(entry.action)}>{actionLabel(entry.action)}</SoftPill>
                  </button>
                </td>
                <td className={cn(td, 'max-w-44 truncate')}>
                  <PatientLink entry={entry} />
                </td>
                {showBranch && (
                  <td className={cn(td, 'hidden max-w-36 truncate text-muted-foreground lg:table-cell')}>
                    {entry.branch ? (entry.branch.name ?? '–') : '–'}
                  </td>
                )}
                <td className={cn(td, 'hidden max-w-72 text-muted-foreground xl:table-cell')}>
                  {summarize(entry.action, entry.details) ?? '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
