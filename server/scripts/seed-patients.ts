// Adds 25 realistic but fictional patients to a clinic in the development database, so screens have something to show.
//
//   npm run seed:patients                    uses your clinic if it is the only one that is not test data
//   npm run seed:patients -- "Clinic name"   picks a clinic by name
//   npm run seed:patients -- --reset         first removes the sample patients this script added earlier, then adds them
//
// Safe to run again: a patient whose phone number already exists in the clinic is skipped. Refuses to run in
// production. The names, numbers and emails are made up; email addresses use example.com so nothing can reach a real
// person. Development data only (PRD REG-2: no real patient data in non-production databases).
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { dateOnly, indiaToday, yearsBetween } from '../src/modules/patients/patientRules.js'

if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to seed sample patients in production.')
  process.exit(1)
}
if (!process.env['DATABASE_URL']) {
  console.error('DATABASE_URL is not set. Run through npm so .env is loaded: npm run seed:patients')
  process.exit(1)
}

interface Sample {
  name: string
  gender: 'male' | 'female'
  /** Age in years, or a date of birth "YYYY-MM-DD". */
  age: number | string
  area: string
  job?: string
  doctor?: string
  email?: boolean
  /** The number belongs to a parent or family member. */
  guardian?: boolean
  emergency?: string
  note: string
}

// Names, areas and doctors are typical of Gandhinagar and Ahmedabad, where the Sunrise Clinic branches are.
const SAMPLES: Sample[] = [
  {
    name: 'Hardik Patel',
    gender: 'male',
    age: 34,
    area: 'Infocity, Gandhinagar',
    job: 'Software engineer',
    email: true,
    emergency: 'Khushbu Patel (wife)',
    note: 'Lower back pain for three weeks. Sits 9 to 10 hours a day.',
  },
  {
    name: 'Krupa Shah',
    gender: 'female',
    age: '1996-08-14',
    area: 'Sargasan, Gandhinagar',
    job: 'School teacher',
    doctor: 'Dr. Mital Shah',
    email: true,
    note: 'Right shoulder impingement. Pain on lifting the arm above shoulder height.',
  },
  {
    name: 'Jayantilal Trivedi',
    gender: 'male',
    age: 67,
    area: 'Sector 21, Gandhinagar',
    job: 'Retired state government officer',
    doctor: 'Dr. Hiren Trivedi (orthopaedics)',
    emergency: 'Chirag Trivedi (son)',
    note: 'Left total knee replacement, week 3. Needs range of motion and gait training.',
  },
  {
    name: 'Hansaben Parmar',
    gender: 'female',
    age: 52,
    area: 'Randesan, Gandhinagar',
    job: 'Homemaker',
    note: 'Frozen shoulder (left). Stiffness is worse at night.',
  },
  {
    name: 'Imran Memon',
    gender: 'male',
    age: 41,
    area: 'Kudasan, Gandhinagar',
    job: 'Shop owner',
    doctor: 'Dr. Ketan Pandya',
    note: 'Cervical spondylosis with pain radiating to the right arm.',
  },
  {
    name: 'Nidhi Desai',
    gender: 'female',
    age: 26,
    area: 'Kudasan, Gandhinagar',
    job: 'Marketing executive',
    email: true,
    note: 'Grade 2 ankle sprain while playing badminton. Swelling is settling.',
  },
  {
    name: 'Vikram Chauhan',
    gender: 'male',
    age: '1987-03-02',
    area: 'Sargasan, Gandhinagar',
    job: 'Marathon runner',
    email: true,
    note: 'Patellofemoral pain syndrome in both knees. Training for a half marathon.',
  },
  {
    name: 'Meenaben Joshi',
    gender: 'female',
    age: 61,
    area: 'Sector 7, Gandhinagar',
    job: 'Retired college lecturer',
    doctor: 'Dr. Hiren Trivedi (orthopaedics)',
    emergency: 'Parth Joshi (son)',
    note: 'Osteoarthritis of both knees. Climbing stairs is the main difficulty.',
  },
  {
    name: 'Dev Bhatt',
    gender: 'male',
    age: '2014-05-21',
    area: 'Kudasan, Gandhinagar',
    guardian: true,
    emergency: 'Mehul Bhatt (father)',
    doctor: 'Dr. Nirav Desai (paediatric orthopaedics)',
    note: 'Right wrist fracture, cast removed last week. Stiffness and grip strengthening.',
  },
  {
    name: 'Anjali Nair',
    gender: 'female',
    age: 33,
    area: 'Infocity, Gandhinagar',
    job: 'HR manager',
    email: true,
    note: 'Neck and upper back stiffness from desk work. Occasional tension headaches.',
  },
  {
    name: 'Bharatbhai Solanki',
    gender: 'male',
    age: 47,
    area: 'Adalaj, Gandhinagar',
    job: 'Truck driver',
    doctor: 'Dr. R. Vaghela',
    note: 'Sciatica from an L5-S1 disc. Pain on long drives and when sitting.',
  },
  {
    name: 'Farzana Sheikh',
    gender: 'female',
    age: 44,
    area: 'Motera, Ahmedabad',
    job: 'Boutique owner',
    email: true,
    note: 'Right tennis elbow. Pain when gripping and lifting.',
  },
  {
    name: 'Ramanbhai Vyas',
    gender: 'male',
    age: 72,
    area: 'Sector 22, Gandhinagar',
    guardian: true,
    emergency: 'Hetal Vyas (daughter)',
    doctor: 'Dr. Ketan Pandya (neurology)',
    note: 'Recovering from a stroke four months ago. Left-side weakness; mobility and balance training.',
  },
  {
    name: 'Pooja Rathod',
    gender: 'female',
    age: 31,
    area: 'Raysan, Gandhinagar',
    job: 'Homemaker',
    note: 'Postnatal lower back and pelvic pain. Baby is five months old.',
  },
  {
    name: 'Rajesh Mehta',
    gender: 'male',
    age: 55,
    area: 'Sargasan, Gandhinagar',
    job: 'Chartered accountant',
    email: true,
    doctor: 'Dr. Kiran Thakkar',
    note: 'Lumbar disc bulge at L4-L5. Wants to avoid surgery.',
  },
  {
    name: 'Ishita Agrawal',
    gender: 'female',
    age: '2003-11-09',
    area: 'Raysan, Gandhinagar',
    job: 'University student',
    note: 'Left hamstring strain during a dance rehearsal. Tightness on forward bend.',
  },
  {
    name: 'Anil Rabari',
    gender: 'male',
    age: 58,
    area: 'Koba, Gandhinagar',
    job: 'Government clerk',
    note: 'Plantar fasciitis. The first steps in the morning are the worst.',
  },
  {
    name: 'Shruti Dave',
    gender: 'female',
    age: 36,
    area: 'Sector 11, Gandhinagar',
    job: 'Architect',
    email: true,
    doctor: 'Dr. Hiren Trivedi (orthopaedics)',
    note: 'ACL reconstruction (right) six weeks ago. Strength and balance phase.',
  },
  {
    name: 'Ayub Vohra',
    gender: 'male',
    age: 49,
    area: 'Kudasan, Gandhinagar',
    job: 'Electrician',
    doctor: 'Dr. Mital Shah',
    note: 'Partial rotator cuff tear, right shoulder. Cannot lift the arm overhead.',
  },
  {
    name: 'Kamlaben Gajjar',
    gender: 'female',
    age: 68,
    area: 'Sector 16, Gandhinagar',
    job: 'Retired',
    guardian: true,
    emergency: 'Nilesh Gajjar (son)',
    note: 'Fall last month. Balance and strength training to reduce fall risk.',
  },
  {
    name: 'Tejas Brahmbhatt',
    gender: 'male',
    age: 27,
    area: 'Kudasan, Gandhinagar',
    job: 'Club cricketer',
    email: true,
    note: 'Lower back stiffness after fast bowling. Core stability programme.',
  },
  {
    name: 'Dhara Pandya',
    gender: 'female',
    age: '1985-01-30',
    area: 'Sargasan, Gandhinagar',
    job: 'Accountant',
    note: 'Carpal tunnel syndrome in both hands. Numbness at night.',
  },
  {
    name: 'Gurpreet Kaur',
    gender: 'female',
    age: 46,
    area: 'Sector 24, Gandhinagar',
    job: 'Boutique owner',
    email: true,
    note: 'Cervicogenic headaches with a stiff neck. Posture correction.',
  },
  {
    name: 'Yash Modi',
    gender: 'male',
    age: '2017-09-12',
    area: 'Sargasan, Gandhinagar',
    guardian: true,
    emergency: 'Pooja Modi (mother)',
    doctor: 'Dr. Nirav Desai (paediatric orthopaedics)',
    note: 'Flat feet assessment and foot-strengthening exercises.',
  },
  {
    name: 'Nikhil Panchal',
    gender: 'male',
    age: 43,
    area: 'Zundal, Gandhinagar',
    job: 'Sales manager',
    email: true,
    note: 'Achilles tendinopathy (left). Started running again three months ago.',
  },
]

/** Mobile numbers that look ordinary but are not sequential or patterned. Made up; not checked against real numbers. */
function phoneFor(index: number): string {
  const prefixes = ['98', '99', '97', '70', '88', '90', '91', '77', '96', '80', '81', '89']
  const tail = String(((index + 11) * 7_919 * 104_729 + 1_234_567) % 100_000_000).padStart(8, '0')
  return `${prefixes[index % prefixes.length]}${tail}`
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })

// Test clinics made by the automated tests end in an 8-character run id or contain SHOTS-.
const looksLikeTestData = (name: string) => /\s[0-9a-f]{8}$/i.test(name) || name.includes('SHOTS-')

const args = process.argv.slice(2)
const reset = args.includes('--reset')
const requested = args.find((arg) => !arg.startsWith('--'))
const tenants = await db.tenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
const candidates = requested
  ? tenants.filter((t) => t.name.toLowerCase() === requested.toLowerCase())
  : tenants.filter((t) => !looksLikeTestData(t.name))

if (candidates.length !== 1) {
  console.error(
    candidates.length === 0
      ? `No clinic found${requested ? ` named "${requested}"` : ' that is not test data'}.`
      : 'More than one clinic could be meant. Say which: npm run seed:patients -- "Clinic name"',
  )
  console.error('Clinics:')
  for (const t of tenants) console.error(`  ${t.name}${looksLikeTestData(t.name) ? '  (test data)' : ''}`)
  await db.$disconnect()
  process.exit(1)
}

const tenant = candidates[0]!
const branches = await db.branch.findMany({ where: { tenantId: tenant.id, isActive: true }, orderBy: { code: 'asc' } })
if (branches.length === 0) {
  console.error(`"${tenant.name}" has no active branch yet. Finish the setup step in the app first.`)
  await db.$disconnect()
  process.exit(1)
}

// Only the exact phone numbers this script generates are ever removed, so real entries are never touched.
if (reset) {
  const removed = await db.patient.deleteMany({
    where: { tenantId: tenant.id, phone: { in: SAMPLES.map((_, index) => phoneFor(index)) } },
  })
  console.log(`Removed ${removed.count} earlier sample patient(s).`)
}

// Patients are registered by the branch's receptionist when there is one, otherwise by the owner.
const people = await db.userAccount.findMany({
  where: { tenantId: tenant.id, isActive: true },
  select: { id: true, branchId: true, role: { select: { key: true } } },
})
const owner = people.find((p) => p.role?.key === 'owner')
if (!owner) {
  console.error(`"${tenant.name}" has no active owner.`)
  await db.$disconnect()
  process.exit(1)
}
const registrarFor = (branchId: string) =>
  people.find((p) => p.role?.key === 'receptionist' && p.branchId === branchId)?.id ?? owner.id

const today = indiaToday()
const todayDate = dateOnly(today.year, today.month, today.day)
const existing = new Set(
  (await db.patient.findMany({ where: { tenantId: tenant.id }, select: { phone: true } })).map((p) => p.phone),
)

let created = 0
let skipped = 0
for (const [index, sample] of SAMPLES.entries()) {
  const phone = phoneFor(index)
  if (existing.has(phone)) {
    skipped += 1
    continue
  }
  // Patients go to the branch nearest their area: the Sargasan side of Gandhinagar to the second branch.
  const nearSecond = /Sargasan|Infocity|Raysan|Randesan|Zundal/.test(sample.area)
  const branch = branches[nearSecond && branches.length > 1 ? 1 : 0]!

  const dob =
    typeof sample.age === 'string' ? dateOnly(...(sample.age.split('-').map(Number) as [number, number, number])) : null
  const [first, ...rest] = sample.name.split(' ')
  const slug = `${first}.${rest.at(-1)}`.toLowerCase()
  // Registered over the last ~6 weeks, oldest first, during clinic hours.
  const daysAgo = Math.round((SAMPLES.length - index) * 1.7)
  const createdAt = new Date(Date.now() - daysAgo * 86_400_000)
  createdAt.setUTCHours(4 + (index % 8), (index * 13) % 60, 0, 0)

  await db.patient.create({
    data: {
      tenantId: tenant.id,
      registeredBranchId: branch.id,
      createdById: registrarFor(branch.id),
      fullName: sample.name,
      phone,
      phoneContactType: sample.guardian ? 'guardian' : 'self',
      dateOfBirth: dob,
      ageYears: dob ? yearsBetween(dob, todayDate) : (sample.age as number),
      ageRecordedOn: todayDate,
      gender: sample.gender,
      address: sample.area,
      emergencyContact: sample.emergency ?? null,
      occupation: sample.job ?? null,
      referringDoctor: sample.doctor ?? null,
      email: sample.email ? `${slug}@example.com` : null,
      notes: sample.note,
      createdAt,
    },
  })
  created += 1
}

console.log(`${tenant.name}: added ${created} patient(s), skipped ${skipped} that already existed.`)
await db.$disconnect()
