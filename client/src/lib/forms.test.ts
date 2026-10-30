import { describe, expect, it, vi } from 'vitest'
import { applyFieldErrors } from './forms'

describe('applyFieldErrors', () => {
  const known = ['name', 'phone'] as const

  it('sets an error on each known field and counts the rest as unmatched', () => {
    const setError = vi.fn()
    const result = applyFieldErrors(
      [
        { field: 'name', message: 'Too short' },
        { field: 'branchId', message: 'Required' },
      ],
      known,
      setError,
    )
    expect(setError).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith('name', { message: 'Too short' })
    expect(result).toEqual({ matched: 1, unmatched: 1 })
  })

  it('maps the server field path onto the form field name', () => {
    const setError = vi.fn()
    const result = applyFieldErrors(
      [{ field: 'body.phone', message: 'Bad' }],
      known,
      setError,
      (f) => f.split('.').pop() ?? f,
    )
    expect(setError).toHaveBeenCalledWith('phone', { message: 'Bad' })
    expect(result).toEqual({ matched: 1, unmatched: 0 })
  })
})
