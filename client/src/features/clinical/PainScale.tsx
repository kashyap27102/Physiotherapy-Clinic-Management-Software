import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** Green to red, so the chosen score reads at a glance. Low scores are calm, high ones stand out. */
function painTone(score: number): string {
  if (score <= 3) return 'bg-success text-white border-success'
  if (score <= 6) return 'bg-amber-500 text-white border-amber-500'
  return 'bg-destructive text-white border-destructive'
}

interface Props {
  id: string
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}

/**
 * A 0 to 10 pain score as one row of large tap targets (a radio group). It wraps to two rows on a phone and fits in
 * one row from a tablet up. Tapping the chosen score again clears it.
 */
export function PainScale({ id, value, onChange, disabled }: Props) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {SCORES.map((score) => {
          const selected = value === score
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.episode.painScoreValue(score)}
              disabled={disabled}
              onClick={() => onChange(selected ? null : score)}
              className={cn(
                'h-11 rounded-lg border text-sm font-semibold tabular-nums transition-colors outline-none',
                'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
                selected ? painTone(score) : 'border-input bg-background hover:bg-muted',
              )}
            >
              {score}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t.episode.painScoreNone}</span>
        <span>{t.episode.painScoreWorst}</span>
      </div>
    </div>
  )
}

/** Read-only pill for a saved score. */
export function PainBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold tabular-nums',
        painTone(score),
      )}
    >
      {t.episode.painScoreValue(score)}
    </span>
  )
}
