import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { daysInMonth, isoDay, monthLabel, monthOf, shiftMonth, weekdayOf, type Month } from '@/lib/calendar'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

interface Props {
  /** First and last day that can be chosen (YYYY-MM-DD). */
  min: string
  max: string
  selected: ReadonlySet<string>
  /** Days that already have a visit: shown, but not chosen again by mistake. */
  taken?: ReadonlySet<string>
  onToggle: (day: string) => void
}

/** A month at a time, tap days to pick or unpick them. Big tap targets for the front desk (h-10). */
export function DayPicker({ min, max, selected, taken, onToggle }: Props) {
  const [shown, setShown] = useState<Month>(() => monthOf(max))
  const first = isoDay(shown.year, shown.month, 1)
  const blanks = weekdayOf(first)
  const days = Array.from({ length: daysInMonth(shown) }, (_, index) => isoDay(shown.year, shown.month, index + 1))
  const canGoBack = first > min.slice(0, 8) + '01'
  const canGoForward = isoDay(shown.year, shown.month, daysInMonth(shown)) < max

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.bulk.prevMonth}
          disabled={!canGoBack}
          onClick={() => setShown(shiftMonth(shown, -1))}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {monthLabel(shown)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.bulk.nextMonth}
          disabled={!canGoForward}
          onClick={() => setShown(shiftMonth(shown, 1))}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {t.bulk.weekdays.map((name, index) => (
          <div key={index} className="py-1 text-xs font-medium text-muted-foreground">
            {name}
          </div>
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {days.map((day) => {
          const outside = day < min || day > max
          const isTaken = taken?.has(day) ?? false
          const isSelected = selected.has(day)
          return (
            <button
              key={day}
              type="button"
              disabled={outside || isTaken}
              aria-pressed={isSelected}
              title={isTaken ? t.bulk.alreadyMarked : outside ? t.bulk.outsideEpisode : undefined}
              onClick={() => onToggle(day)}
              className={cn(
                'relative h-10 rounded-lg text-sm tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                isSelected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted',
                (outside || isTaken) && 'cursor-not-allowed text-muted-foreground/40 hover:bg-transparent',
              )}
            >
              {Number(day.slice(8))}
              {isTaken && (
                <span
                  className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-success"
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
