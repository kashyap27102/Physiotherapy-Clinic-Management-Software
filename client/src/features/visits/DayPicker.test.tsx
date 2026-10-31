import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayPicker } from './DayPicker'

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const dayButton = (day: number) =>
  [...container.querySelectorAll('button')].find((button) => button.textContent === String(day)) as HTMLButtonElement

function show(props: Partial<React.ComponentProps<typeof DayPicker>> = {}) {
  const onToggle = vi.fn()
  act(() =>
    root.render(
      <DayPicker
        min="2026-10-07"
        max="2026-10-20"
        selected={new Set(['2026-10-10'])}
        taken={new Set(['2026-10-12'])}
        onToggle={onToggle}
        {...props}
      />,
    ),
  )
  return onToggle
}

describe('DayPicker (bulk attendance)', () => {
  it('opens on the month of the last allowed day and names it', () => {
    show()
    expect(container.textContent).toContain('October 2026')
  })

  it('lets days between the first and last allowed day be picked, and reports the day', () => {
    const onToggle = show()
    act(() => dayButton(9).click())
    expect(onToggle).toHaveBeenCalledWith('2026-10-09')
  })

  it('shows the chosen days as pressed', () => {
    show()
    expect(dayButton(10).getAttribute('aria-pressed')).toBe('true')
    expect(dayButton(11).getAttribute('aria-pressed')).toBe('false')
  })

  it('does not allow days before the episode, in the future, or that already have a visit', () => {
    const onToggle = show()
    for (const day of [3, 6, 12, 21, 30]) {
      expect(dayButton(day).disabled, `day ${day}`).toBe(true)
      act(() => dayButton(day).click())
    }
    expect(onToggle).not.toHaveBeenCalled()
    expect(dayButton(7).disabled).toBe(false)
    expect(dayButton(20).disabled).toBe(false)
  })

  it('cannot move to a month with nothing to choose', () => {
    show()
    const next = container.querySelector('button[aria-label="Next month"]') as HTMLButtonElement
    const previous = container.querySelector('button[aria-label="Previous month"]') as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(previous.disabled).toBe(true)
  })

  it('moves back to an earlier month when the episode started there', () => {
    show({ min: '2026-09-20' })
    const previous = container.querySelector('button[aria-label="Previous month"]') as HTMLButtonElement
    expect(previous.disabled).toBe(false)
    act(() => previous.click())
    expect(container.textContent).toContain('September 2026')
    expect(dayButton(19).disabled).toBe(true)
    expect(dayButton(20).disabled).toBe(false)
  })
})
