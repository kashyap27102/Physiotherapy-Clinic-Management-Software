import { useQuery } from '@tanstack/react-query'
import { Banknote, FileText, Plus, Receipt, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { api, type LedgerRecord, type PatientDetail } from '@/api'
import { Can } from '@/auth/guards'
import { useCan } from '@/auth/hooks'
import { EmptyState } from '@/components/common/EmptyState'
import { SectionCard, SoftPill } from '@/components/common/SectionCard'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { InvoiceDialog } from './InvoiceDialog'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { RefundDialog } from './RefundDialog'
import { ReverseDialog } from './ReverseDialog'

/**
 * PAT-003 Payments tab (BILL-002 to BILL-007): the patient's whole account, newest first and tagged with the branch.
 * Charges, payments, refunds and reversals all stay listed; a reversed entry is marked, never removed. Only shown to
 * users with ledger.view. Opening the ledger is audited, so it is not refetched on focus.
 */
export function PaymentsTab({ patient }: { patient: PatientDetail }) {
  const canIssue = useCan('document.issue')
  const ledger = useQuery({
    queryKey: queryKeys.patientLedger(patient.id),
    queryFn: () => api.ledger.forPatient(patient.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const invoices = useQuery({
    queryKey: queryKeys.patientDocuments(patient.id),
    queryFn: () => api.documents.forPatient(patient.id),
    enabled: canIssue,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const [paying, setPaying] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const [reversing, setReversing] = useState<LedgerRecord | null>(null)

  if (ledger.isPending) return <Skeleton className="h-64 w-full rounded-xl" />
  if (ledger.isError) {
    return (
      <div className="rounded-xl border bg-card shadow-xs">
        <EmptyState icon={Banknote}>{t.ledger.loadError}</EmptyState>
      </div>
    )
  }

  const { items, balance } = ledger.data
  const issuedInvoices = (invoices.data ?? []).filter((doc) => doc.type === 'INVOICE')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Can permission="payment.record">
          <Button className="h-10 gap-2 px-4" onClick={() => setPaying(true)}>
            <Plus aria-hidden />
            {t.visit.recordPayment}
          </Button>
        </Can>
        {balance.state === 'credit' && (
          <Can permission="refund.process">
            <Button variant="outline" className="h-10 gap-2 px-4" onClick={() => setRefunding(true)}>
              <Banknote aria-hidden />
              {t.refund.button}
            </Button>
          </Can>
        )}
        <Can permission="document.issue">
          <Button variant="outline" className="h-10 gap-2 px-4" onClick={() => setInvoicing(true)}>
            <FileText aria-hidden />
            {t.documents.invoiceButton}
          </Button>
        </Can>
      </div>

      <SectionCard
        title={t.patient.tabs.payments}
        badge={<SoftPill tone="muted">{t.ledger.newestFirst}</SoftPill>}
        bodyClassName="p-0"
      >
        {items.length === 0 ? (
          <EmptyState icon={Receipt}>
            <strong className="block text-foreground">{t.patient.paymentsEmptyTitle}</strong>
            {t.ledger.empty}
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {items.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onReverse={() => setReversing(entry)} />
            ))}
          </ul>
        )}
      </SectionCard>

      {issuedInvoices.length > 0 && (
        <SectionCard title={t.documents.invoices} bodyClassName="p-0">
          <ul className="divide-y">
            {issuedInvoices.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{doc.number}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(doc.issuedAt)} · {doc.branchName}
                  </div>
                </div>
                <a
                  href={api.documents.pdfUrl(doc.id)}
                  target="_blank"
                  rel="noopener"
                  className={buttonVariants({ variant: 'outline', className: 'h-9 gap-1.5 px-3' })}
                >
                  <FileText aria-hidden />
                  {t.documents.open}
                </a>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <RecordPaymentDialog patientId={patient.id} open={paying} onOpenChange={setPaying} />
      {balance.state === 'credit' && (
        <RefundDialog patientId={patient.id} credit={balance} open={refunding} onOpenChange={setRefunding} />
      )}
      <InvoiceDialog patientId={patient.id} open={invoicing} onOpenChange={setInvoicing} />
      <ReverseDialog
        patientId={patient.id}
        open={reversing !== null}
        onOpenChange={(open) => !open && setReversing(null)}
        title={t.ledger.reverseTitle}
        description={reversing ? t.ledger.reverseBody(t.ledger[reversing.type], formatINR(reversing.amount)) : ''}
        reverse={(reason, key) => api.ledger.reverse(reversing?.id ?? '', reason, key)}
      />
    </div>
  )
}

function EntryRow({ entry, onReverse }: { entry: LedgerRecord; onReverse: () => void }) {
  const canReverse = useCan('entry.reverse')
  const canIssue = useCan('document.issue')
  const reversed = entry.reversedByEntryId !== null
  const isReversal = entry.type === 'REVERSAL'

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('font-medium', isReversal && 'text-muted-foreground')}>{t.ledger[entry.type]}</span>
          {entry.method && <SoftPill tone="muted">{t.payment.methods[entry.method]}</SoftPill>}
          {reversed && <SoftPill tone="danger">{t.ledger.reversed}</SoftPill>}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDateTime(entry.createdAt)} · {entry.branchName} · {t.ledger.by(entry.createdByName)}
        </div>
        {(entry.reference || entry.reason || isReversal) && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {[
              entry.reference,
              entry.reason ? t.ledger.reasonLine(entry.reason) : null,
              isReversal ? t.ledger.reversesLine : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </div>

      <div
        className={cn(
          'text-right font-semibold tabular-nums',
          (reversed || isReversal) && 'text-muted-foreground',
          reversed && 'line-through',
        )}
      >
        {formatINR(entry.amount)}
      </div>

      <div className="flex items-center gap-2">
        {canIssue && entry.documentId && (
          <a
            href={api.documents.pdfUrl(entry.documentId)}
            target="_blank"
            rel="noopener"
            title={t.documents.printHint}
            className={buttonVariants({ variant: 'outline', className: 'h-9 gap-1.5 px-3' })}
          >
            <Receipt aria-hidden />
            {entry.documentNumber}
          </a>
        )}
        {canReverse && !reversed && !isReversal && (
          <Button
            variant="ghost"
            className="h-9 gap-1.5 px-3 text-muted-foreground hover:text-destructive"
            onClick={onReverse}
          >
            <Undo2 aria-hidden />
            {t.ledger.reverse}
          </Button>
        )}
      </div>
    </li>
  )
}
