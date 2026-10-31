import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/api'
import { useIdempotencyKey } from './useIdempotencyKey'

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

function mountHook() {
  let latest!: ReturnType<typeof useIdempotencyKey>
  function Probe() {
    // Test probe: hands the hook result to the test.
    // oxlint-disable-next-line react/globals
    latest = useIdempotencyKey()
    return null
  }
  root = createRoot(document.body.appendChild(document.createElement('div')))
  act(() => root!.render(<Probe />))
  return () => latest
}

describe('useIdempotencyKey', () => {
  it('keeps the same key after a network error, so a retry cannot be charged twice', () => {
    const get = mountHook()
    const first = get().current()
    act(() => get().afterError(new ApiError(0, 'NETWORK', 'offline')))
    expect(get().current()).toBe(first)
  })

  it('uses a fresh key after any other error', () => {
    const get = mountHook()
    const first = get().current()
    act(() => get().afterError(new ApiError(422, 'VALIDATION_FAILED', 'bad')))
    expect(get().current()).not.toBe(first)
  })
})
