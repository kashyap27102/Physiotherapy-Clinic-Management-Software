import { SectionCard } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { t } from '@/strings/en'

/** Placeholder until the owner dashboard (REP-001) is built. */
export function DashboardPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: t.dashboard.title }]} />
      <SectionCard title={t.dashboard.title}>
        <p className="text-sm text-muted-foreground">{t.dashboard.body}</p>
      </SectionCard>
    </>
  )
}
