import { initials } from '@/lib/forms'
import { cn } from '@/lib/utils'

// A few calm tints so a list of people is easy to scan; the same name always gets the same tint.
const TINTS = [
  'bg-accent text-accent-foreground',
  'bg-success-soft text-success',
  'bg-[color-mix(in_oklch,var(--chart-3),transparent_80%)] text-[color-mix(in_oklch,var(--chart-3),var(--foreground)_35%)]',
  'bg-[color-mix(in_oklch,var(--chart-5),transparent_82%)] text-[color-mix(in_oklch,var(--chart-5),var(--foreground)_25%)]',
]

function tintFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length] ?? TINTS[0]!
}

export function Avatar({ name, className, muted }: { name: string; className?: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        muted ? 'bg-muted text-muted-foreground' : tintFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
