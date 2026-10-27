import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

const LENGTH = 6

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  /** Called once all six digits are present (typed or pasted). */
  onComplete?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
}

/**
 * Six single-digit boxes for the emailed code (AUTH-002). Typing moves forward, Backspace moves back, arrows move,
 * and pasting a whole code fills every box. The first box carries autocomplete="one-time-code" so phones offer
 * the code from the email.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, autoFocus }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')

  const focus = (index: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus()

  function update(next: string, focusIndex: number) {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH)
    onChange(clean)
    focus(focusIndex)
    if (clean.length === LENGTH) onComplete?.(clean)
  }

  function handleInput(index: number, raw: string) {
    const typed = raw.replace(/\D/g, '')
    if (!typed) return
    // Autofill or a fast typist can drop several digits into one box.
    const next = (value.slice(0, index) + typed + value.slice(index + typed.length)).slice(0, LENGTH)
    update(next, index + typed.length)
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (digits[index]) update(value.slice(0, index) + value.slice(index + 1), index)
      else if (index > 0) update(value.slice(0, index - 1) + value.slice(index), index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focus(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focus(index + 1)
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    event.preventDefault()
    update(pasted, pasted.length)
  }

  return (
    <div className="flex justify-between gap-2 sm:gap-3" role="group" aria-label={t.auth.otpLabel}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el
          }}
          value={digit}
          onChange={(e) => handleInput(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && index === 0}
          maxLength={LENGTH}
          disabled={disabled}
          aria-label={t.auth.otpDigit(index + 1)}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-13 w-full min-w-0 rounded-xl border border-input bg-background text-center text-xl font-semibold tabular-nums shadow-xs transition-all outline-none sm:h-14 sm:text-2xl dark:bg-input/30',
            'focus:border-ring focus:ring-4 focus:ring-ring/25',
            digit && 'border-primary/40 bg-accent/40',
            invalid && 'border-destructive ring-4 ring-destructive/15',
            disabled && 'opacity-60',
          )}
        />
      ))}
    </div>
  )
}
