import { Link } from 'react-router-dom'
import type { AuditEntry } from '@/api'
import { SoftPill } from '@/components/common/SectionCard'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/date'
import { t } from '@/strings/en'
import { actionLabel, actionTone, changesOf, factsOf } from './auditSummary'

interface Props {
  entry: AuditEntry | null
  onOpenChange: (open: boolean) => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** Everything the log holds about one entry, read-only: who, when, what changed, and the reference ids. */
export function AuditDetailDialog({ entry, onOpenChange }: Props) {
  const changes = entry ? changesOf(entry.details) : []
  const facts = entry ? factsOf(entry.details) : []

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {entry && (
          <>
            <DialogHeader className="pb-3">
              <DialogTitle>{t.audit.detail.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <SoftPill tone={actionTone(entry.action)}>{actionLabel(entry.action)}</SoftPill>
                <span>{formatDateTime(entry.at)}</span>
              </DialogDescription>
            </DialogHeader>

            <dl className="divide-y border-y">
              <Row label={t.audit.detail.who}>
                {entry.user ? (entry.user.fullName ?? t.audit.unknownUser) : t.audit.system}
              </Row>
              {entry.branch && <Row label={t.audit.detail.branch}>{entry.branch.name ?? '–'}</Row>}
              {entry.patient && (
                <Row label={t.audit.detail.patient}>
                  <Link
                    to={`/patients/${entry.patient.id}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {entry.patient.fullName ?? t.audit.unknownPatient}
                  </Link>
                </Row>
              )}
              {facts.map((fact) => (
                <Row key={fact.label} label={fact.label}>
                  {fact.value}
                </Row>
              ))}
              {entry.ipAddress && <Row label={t.audit.detail.address}>{entry.ipAddress}</Row>}
              {entry.targetId && (
                <Row label={t.audit.detail.reference}>
                  <span className="text-xs text-muted-foreground">
                    {entry.targetType ? `${entry.targetType} · ` : ''}
                    {entry.targetId}
                  </span>
                </Row>
              )}
            </dl>

            {changes.length > 0 && (
              <section className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">{t.audit.detail.changes}</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t.audit.detail.field}</th>
                        <th className="px-3 py-2 font-medium">{t.audit.detail.before}</th>
                        <th className="px-3 py-2 font-medium">{t.audit.detail.after}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {changes.map((change) => (
                        <tr key={change.field}>
                          <td className="px-3 py-2 capitalize">{change.field}</td>
                          <td className="px-3 py-2 break-words text-muted-foreground">{change.before}</td>
                          <td className="px-3 py-2 break-words">{change.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={buttonVariants({ variant: 'outline', className: 'h-10 px-4' })}
              >
                {t.common.close}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
