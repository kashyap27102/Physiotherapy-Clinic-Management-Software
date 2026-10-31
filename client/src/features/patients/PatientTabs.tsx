import type { ReactNode } from 'react'
import type { PatientDetail } from '@/api'
import { SectionCard, SoftPill } from '@/components/common/SectionCard'
import { formatDate } from '@/lib/date'
import { formatPhone } from '@/lib/phone'
import { t } from '@/strings/en'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

/** PAT-003 Overview: everything known about the person, grouped. */
export function OverviewTab({ patient }: { patient: PatientDetail }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <SectionCard title={t.patient.personalSection}>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <Detail label={t.register.fullName}>{patient.fullName}</Detail>
          <Detail label={t.register.gender}>{t.patient.gender[patient.gender]}</Detail>
          <Detail label={t.register.age}>{t.patient.ageYears(patient.age)}</Detail>
          <Detail label={t.patient.dateOfBirth}>{patient.dateOfBirth ? formatDate(patient.dateOfBirth) : null}</Detail>
          <Detail label={t.patient.occupation}>{patient.occupation}</Detail>
          <Detail label={t.patient.referringDoctor}>{patient.referringDoctor}</Detail>
        </dl>
      </SectionCard>

      <SectionCard title={t.patient.contactSection}>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <Detail label={t.patient.phone}>
            <span className="inline-flex flex-wrap items-center gap-2">
              {formatPhone(patient.phone)}
              {patient.phoneContactType === 'guardian' && <SoftPill tone="muted">{t.patient.guardianNumber}</SoftPill>}
            </span>
          </Detail>
          <Detail label={t.patient.email}>{patient.email}</Detail>
          <Detail label={t.patient.emergencyContact}>{patient.emergencyContact}</Detail>
          <div className="sm:col-span-2">
            <Detail label={t.patient.address}>{patient.address}</Detail>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title={t.patient.notes}>
        <p className="text-sm whitespace-pre-wrap">
          {patient.notes || <span className="text-muted-foreground">—</span>}
        </p>
      </SectionCard>

      <SectionCard title={t.patient.registeredAt}>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <Detail label={t.register.branch}>{patient.registeredBranch}</Detail>
          <Detail label={t.patient.registeredAt}>{formatDate(patient.createdAt)}</Detail>
        </dl>
        <p className="mt-5 text-xs text-muted-foreground">{t.patient.openedAcrossBranches}</p>
      </SectionCard>
    </div>
  )
}
