// Money is always a string with two decimals ("500.00") between the API and the UI.
// Floating point is never used for calculations. These helpers use integer paise.

const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/

export function isValidAmount(input: string): boolean {
  return AMOUNT_PATTERN.test(input.trim())
}

/** "1500.5" -> 150050. Returns null when the text is not a valid amount. */
export function toPaise(input: string): number | null {
  const text = input.trim()
  if (!AMOUNT_PATTERN.test(text)) return null
  const [rupees = '0', decimals = ''] = text.split('.')
  return Number(rupees) * 100 + Number(decimals.padEnd(2, '0'))
}

/** 150050 -> "1500.50" */
export function fromPaise(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const decimals = String(abs % 100).padStart(2, '0')
  return `${sign}${rupees}.${decimals}`
}

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const inrWithPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "1500.00" -> "₹1,500" ; "1500.50" -> "₹1,500.50" (paise are shown only when present). */
export function formatINR(amount: string): string {
  const paise = toPaise(amount)
  if (paise === null) return amount
  return (paise % 100 === 0 ? inrWhole : inrWithPaise).format(paise / 100)
}
