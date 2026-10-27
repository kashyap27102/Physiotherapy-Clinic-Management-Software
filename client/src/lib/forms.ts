/** Applies server field errors (422) to a react-hook-form form; returns true if any field matched. */
export function applyFieldErrors<T extends string>(
  fields: { field: string; message: string }[],
  known: readonly T[],
  setError: (name: T, error: { message: string }) => void,
): boolean {
  let matched = false
  for (const { field, message } of fields) {
    if ((known as readonly string[]).includes(field)) {
      setError(field as T, { message })
      matched = true
    }
  }
  return matched
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
