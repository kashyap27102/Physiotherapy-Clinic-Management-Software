/**
 * Applies server field errors (422) to a react-hook-form form. `toName` maps the server's field path onto the form's
 * field name (default: as is). Returns how many fields matched and how many did not, so a caller can show a general
 * message only when something was left over.
 */
export function applyFieldErrors<T extends string>(
  fields: { field: string; message: string }[],
  known: readonly T[],
  setError: (name: T, error: { message: string }) => void,
  toName: (serverField: string) => string = (name) => name,
): { matched: number; unmatched: number } {
  let matched = 0
  let unmatched = 0
  for (const { field, message } of fields) {
    const name = toName(field)
    if ((known as readonly string[]).includes(name)) {
      setError(name as T, { message })
      matched++
    } else {
      unmatched++
    }
  }
  return { matched, unmatched }
}

/** Up to two initials, skipping titles such as "Dr.". */
export function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter((part) => part && !part.endsWith('.'))
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
