import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api'
import { t } from '@/strings/en'
import { useFormMutation } from './useFormMutation'

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

const FIELDS = ['name', 'phone'] as const

async function run(failure: unknown, extra: { onError?: (e: unknown) => string | boolean | void } = {}) {
  const setError = vi.fn()
  let latest!: ReturnType<typeof useFormMutation<unknown, void, (typeof FIELDS)[number]>>
  function Probe() {
    // Test probe: hands the hook result to the test.
    // oxlint-disable-next-line react/globals
    latest = useFormMutation({
      mutationFn: () => Promise.reject(failure),
      fields: FIELDS,
      setError,
      ...extra,
    })
    return null
  }
  root = createRoot(document.body.appendChild(document.createElement('div')))
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ),
  )
  await act(async () => latest.submit())
  return { setError, formError: () => latest.formError }
}

describe('useFormMutation', () => {
  it('puts server field errors on their fields and shows no general message', async () => {
    const { setError, formError } = await run(
      new ApiError(422, 'VALIDATION_FAILED', 'Invalid', [{ field: 'name', message: 'Too short' }]),
    )
    expect(setError).toHaveBeenCalledWith('name', { message: 'Too short' })
    expect(formError()).toBeNull()
  })

  it('shows a general message when some field errors have no field on the form', async () => {
    const { setError, formError } = await run(
      new ApiError(422, 'VALIDATION_FAILED', 'Invalid', [
        { field: 'name', message: 'Too short' },
        { field: 'other', message: 'Nope' },
      ]),
    )
    expect(setError).toHaveBeenCalledTimes(1)
    expect(formError()).toBe('Invalid')
  })

  it('shows the server message for other API errors and a generic one otherwise', async () => {
    expect((await run(new ApiError(409, 'VERSION_CONFLICT', 'Changed by someone else'))).formError()).toBe(
      'Changed by someone else',
    )
    expect((await run(new Error('boom'))).formError()).toBe(t.common.genericError)
  })

  it('lets onError handle a failure first', async () => {
    const handled = await run(new ApiError(409, 'DUPLICATE_PATIENT_WARNING', 'Duplicate'), { onError: () => true })
    expect(handled.formError()).toBeNull()
    const custom = await run(new ApiError(409, 'VERSION_CONFLICT', 'x'), { onError: () => 'Custom' })
    expect(custom.formError()).toBe('Custom')
  })
})
