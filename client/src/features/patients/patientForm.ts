import type { CreatePatientInput, Gender, PatientDetail, UpdatePatientInput } from '@/api'
import type { PatientFormValues } from './PatientFormFields'

export const GENDERS: Gender[] = ['female', 'male', 'other', 'undisclosed']

/** Field names the server can send errors for; anything else is shown as a general message. */
export const PATIENT_FORM_FIELDS = [
  'fullName',
  'phone',
  'phoneContactType',
  'age',
  'dateOfBirth',
  'gender',
  'branchId',
  'address',
  'emergencyContact',
  'occupation',
  'referringDoctor',
  'email',
  'notes',
] as const satisfies readonly (keyof PatientFormValues)[]

/** A blank register form. Text typed into the search box is carried over: digits become the phone, words the name. */
export function blankValues(prefill = ''): PatientFormValues {
  const text = prefill.trim()
  const isPhone = /^[\d\s+().-]{3,}$/.test(text)
  return {
    fullName: text && !isPhone ? text : '',
    phone: text && isPhone ? text : '',
    phoneContactType: 'self',
    ageMode: 'age',
    age: '',
    dateOfBirth: '',
    gender: '',
    branchId: '',
    address: '',
    emergencyContact: '',
    occupation: '',
    referringDoctor: '',
    email: '',
    notes: '',
  }
}

export function valuesFromPatient(patient: PatientDetail): PatientFormValues {
  return {
    fullName: patient.fullName,
    phone: patient.phone,
    phoneContactType: patient.phoneContactType,
    ageMode: patient.dateOfBirth ? 'dob' : 'age',
    age: String(patient.age),
    dateOfBirth: patient.dateOfBirth ?? '',
    gender: patient.gender,
    branchId: '',
    address: patient.address ?? '',
    emergencyContact: patient.emergencyContact ?? '',
    occupation: patient.occupation ?? '',
    referringDoctor: patient.referringDoctor ?? '',
    email: patient.email ?? '',
    notes: patient.notes ?? '',
  }
}

const orUndefined = (text: string) => text.trim() || undefined

export function toCreateInput(values: PatientFormValues): CreatePatientInput {
  return {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
    phoneContactType: values.phoneContactType,
    ...(values.ageMode === 'dob' ? { dateOfBirth: values.dateOfBirth } : { age: Number(values.age) }),
    gender: values.gender as CreatePatientInput['gender'],
    ...(values.branchId ? { branchId: values.branchId } : {}),
    ...(orUndefined(values.address) ? { address: values.address.trim() } : {}),
    ...(orUndefined(values.emergencyContact) ? { emergencyContact: values.emergencyContact.trim() } : {}),
    ...(orUndefined(values.occupation) ? { occupation: values.occupation.trim() } : {}),
    ...(orUndefined(values.referringDoctor) ? { referringDoctor: values.referringDoctor.trim() } : {}),
    ...(orUndefined(values.email) ? { email: values.email.trim() } : {}),
    ...(orUndefined(values.notes) ? { notes: values.notes.trim() } : {}),
  }
}

/** Sends every field. An empty optional field clears it; the server records only what actually changed. */
export function toUpdateInput(values: PatientFormValues): UpdatePatientInput {
  return {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
    phoneContactType: values.phoneContactType,
    ...(values.ageMode === 'dob' ? { dateOfBirth: values.dateOfBirth } : { age: Number(values.age) }),
    gender: values.gender as CreatePatientInput['gender'],
    address: values.address.trim(),
    emergencyContact: values.emergencyContact.trim(),
    occupation: values.occupation.trim(),
    referringDoctor: values.referringDoctor.trim(),
    email: values.email.trim(),
    notes: values.notes.trim(),
  }
}
