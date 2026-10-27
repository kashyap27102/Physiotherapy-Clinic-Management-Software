import { passwordStrength } from '@/lib/passwordStrength'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

const BAR_COLOURS = ['bg-destructive', 'bg-destructive', 'bg-chart-3', 'bg-primary', 'bg-success'] as const
const TEXT_COLOURS = [
  'text-muted-foreground',
  'text-destructive',
  'text-chart-3',
  'text-primary',
  'text-success',
] as const

/** Four-segment meter under a new-password field. A hint only; the server has the final say. */
export function PasswordStrength({ password }: { password: string }) {
  const score = passwordStrength(password)
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-1.5 flex-1 rounded-full bg-muted transition-colors duration-300',
              password && score >= segment && BAR_COLOURS[score],
            )}
          />
        ))}
      </div>
      <p className="flex justify-between text-xs">
        <span className="text-muted-foreground">{t.strength.label}</span>
        <span className={cn('font-medium', password ? TEXT_COLOURS[score] : 'text-muted-foreground')}>
          {password ? t.strength.levels[score] : '—'}
        </span>
      </p>
    </div>
  )
}
