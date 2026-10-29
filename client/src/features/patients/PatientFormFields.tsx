import { CalendarDays, Hash } from 'lucide-react'
import { useState } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import type { Gender } from '@/api'
import { Field, inputClassName, textareaClassName } from '@/components/common/Field'
import { Input } from '@/components/ui/input'
import { GENDERS } from '@/features/patients/patientForm'
import { dayKey } from '@/lib/date'
import { normalisePhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

/** The values the register and edit forms share (everything is text until it is sent). */
export interface PatientFormValues {
  fullName: string
  phone: string
  phoneContactType: 'self' | 'guardian'
  ageMode: 'age' | 'dob'
  age: string
  dateOfBirth: string
  gender: Gender | ''
  branchId: string
  address: string
  emergencyContact: string
  occupation: string
  referringDoctor: string
  email: string
  notes: string
}

type Register = UseFormRegister<PatientFormValues>
type Errors = FieldErrors<PatientFormValues>

/** A row of radio-style pills; the real radio inputs stay in the page for keyboards and screen readers. */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  name,
  register,
  invalid,
}: {
  legend: string
  options: { value: T; label: string; icon?: typeof Hash }[]
  value: T | ''
  name: 'gender' | 'ageMode' | 'phoneContactType'
  register: Register
  invalid?: boolean
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm leading-none font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const Icon = option.icon
          const selected = value === option.value
          return (
            <label
              key={option.value}
              className={cn(
                'flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium transition-colors select-none',
                'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                selected
                  ? 'border-primary/60 bg-accent text-accent-foreground'
                  : 'border-input bg-background hover:bg-muted/60 dark:bg-input/30',
                invalid && !selected && 'border-destructive/60',
              )}
            >
              <input type="radio" value={option.value} className="sr-only" {...register(name)} />
              {Icon && <Icon className="size-4" aria-hidden />}
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Mandatory fields: name, phone, age or date of birth, gender (PAT-001). */
export function CoreFields({
  register,
  errors,
  values,
}: {
  register: Register
  errors: Errors
  values: Pick<PatientFormValues, 'ageMode' | 'gender' | 'phoneContactType'>
}) {
  // A date of birth cannot be in the future; today is read once, in India time.
  const [today] = useState(() => dayKey(new Date()))
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id="fullName" label={t.register.fullName} error={errors.fullName?.message}>
          <Input
            id="fullName"
            autoComplete="off"
            autoFocus
            aria-invalid={Boolean(errors.fullName) || undefined}
            className={inputClassName}
            {...register('fullName', { validate: (v) => v.trim().length >= 2 || t.register.errors.fullName })}
          />
        </Field>
      </div>

      <Field id="phone" label={t.register.phone} error={errors.phone?.message}>
        <div
          className={cn(
            'flex h-10 items-center overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
            errors.phone && 'border-destructive ring-3 ring-destructive/20',
          )}
        >
          <span className="flex h-full items-center border-r bg-muted/60 px-3 text-sm text-muted-foreground">
            {t.register.phonePrefix}
          </span>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder={t.register.phonePlaceholder}
            aria-invalid={Boolean(errors.phone) || undefined}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            {...register('phone', { validate: (v) => normalisePhone(v) !== null || t.register.errors.phone })}
          />
        </div>
      </Field>

      <Segmented
        legend={t.register.phoneOwner}
        name="phoneContactType"
        register={register}
        value={values.phoneContactType}
        options={[
          { value: 'self', label: t.register.contactSelf },
          { value: 'guardian', label: t.register.contactGuardian },
        ]}
      />

      <div className="space-y-3 sm:col-span-2">
        <Segmented
          legend={t.register.ageMode.age + ' / ' + t.register.ageMode.dob}
          name="ageMode"
          register={register}
          value={values.ageMode}
          options={[
            { value: 'age', label: t.register.ageMode.age, icon: Hash },
            { value: 'dob', label: t.register.ageMode.dob, icon: CalendarDays },
          ]}
        />
        {values.ageMode === 'age' ? (
          <Field id="age" label={t.register.age} error={errors.age?.message}>
            <Input
              id="age"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(errors.age) || undefined}
              className={cn(inputClassName, 'sm:max-w-40')}
              {...register('age', {
                validate: (v) => (/^\d{1,3}$/.test(v.trim()) && Number(v) <= 120) || t.register.errors.age,
              })}
            />
          </Field>
        ) : (
          <Field id="dateOfBirth" label={t.register.dob} error={errors.dateOfBirth?.message} hint={t.register.dobHint}>
            <Input
              id="dateOfBirth"
              type="date"
              max={today}
              aria-invalid={Boolean(errors.dateOfBirth) || undefined}
              className={cn(inputClassName, 'sm:max-w-52')}
              {...register('dateOfBirth', { validate: (v) => v !== '' || t.register.errors.dob })}
            />
          </Field>
        )}
      </div>

      <div className="sm:col-span-2">
        <Segmented
          legend={t.register.gender}
          name="gender"
          register={register}
          value={values.gender}
          invalid={Boolean(errors.gender)}
          options={GENDERS.map((g) => ({ value: g, label: t.patient.gender[g] }))}
        />
        {errors.gender && (
          <p className="mt-1.5 text-xs text-destructive" role="alert">
            {errors.gender.message}
          </p>
        )}
      </div>
    </div>
  )
}

/** Optional details (address, emergency contact, occupation, referring doctor, email, notes). */
export function OptionalFields({ register, errors }: { register: Register; errors: Errors }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field id="email" label={t.patient.email} optional error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="off"
          className={inputClassName}
          aria-invalid={Boolean(errors.email) || undefined}
          {...register('email', {
            validate: (v) => v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || t.signup.invalidEmail,
          })}
        />
      </Field>
      <Field id="emergencyContact" label={t.patient.emergencyContact} optional error={errors.emergencyContact?.message}>
        <Input id="emergencyContact" autoComplete="off" className={inputClassName} {...register('emergencyContact')} />
      </Field>
      <Field id="occupation" label={t.patient.occupation} optional error={errors.occupation?.message}>
        <Input id="occupation" autoComplete="off" className={inputClassName} {...register('occupation')} />
      </Field>
      <Field id="referringDoctor" label={t.patient.referringDoctor} optional error={errors.referringDoctor?.message}>
        <Input id="referringDoctor" autoComplete="off" className={inputClassName} {...register('referringDoctor')} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="address" label={t.patient.address} optional error={errors.address?.message}>
          <Input id="address" autoComplete="off" className={inputClassName} {...register('address')} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="notes" label={t.patient.notes} optional error={errors.notes?.message}>
          <textarea id="notes" rows={3} className={textareaClassName} {...register('notes')} />
        </Field>
      </div>
    </div>
  )
}
