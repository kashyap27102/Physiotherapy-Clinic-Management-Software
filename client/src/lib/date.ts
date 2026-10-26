const TIME_ZONE = 'Asia/Kolkata'

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: TIME_ZONE,
})

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE,
})

export const formatDate = (iso: string): string => dateFmt.format(new Date(iso))
export const formatTime = (iso: string): string => timeFmt.format(new Date(iso))
export const formatDateTime = (iso: string): string => `${formatDate(iso)}, ${formatTime(iso)}`

/** "2026-10-26" in India time, used to decide what counts as "today". */
export const dayKey = (iso: string | Date): string => dayKeyFmt.format(typeof iso === 'string' ? new Date(iso) : iso)

export const isToday = (iso: string): boolean => dayKey(iso) === dayKey(new Date())

/** Indian financial year (April to March): 2026-10-26 -> "2026-27", 2027-02-01 -> "2026-27". */
export function financialYear(iso: string | Date): string {
  const [year = '0', month = '0'] = dayKey(iso).split('-')
  const y = Number(year)
  const start = Number(month) >= 4 ? y : y - 1
  return `${start}-${String(start + 1).slice(-2)}`
}
