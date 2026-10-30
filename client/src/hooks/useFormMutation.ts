import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, isApiError } from '@/api'
import { applyFieldErrors } from '@/lib/forms'
import { t } from '@/strings/en'

interface Options<TData, TVars, TField extends string> {
  mutationFn: (variables: TVars) => Promise<TData>
  onSuccess?: (data: TData, variables: TVars) => void | Promise<void>
  /** The form's field names and its react-hook-form `setError`; server 422 field errors land on matching fields. */
  fields: readonly TField[]
  setError: (name: TField, error: { message: string }) => void
  /** Maps the server's field path onto the form's field name (default: as is). */
  toName?: (serverField: string) => string
  /**
   * First look at a failure. Return a string to show it as the form message, or true when the failure was handled
   * here; return nothing to fall through to the default handling.
   */
  onError?: (error: unknown) => string | boolean | void
}

/**
 * A save for a react-hook-form form. A failed save puts the server's field errors on the matching fields and shows one
 * message above the buttons for anything that is left (or for any other error). `submit` clears the old message first.
 */
export function useFormMutation<TData, TVars, TField extends string>({
  mutationFn,
  onSuccess,
  fields,
  setError,
  toName,
  onError,
}: Options<TData, TVars, TField>) {
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn,
    onSuccess,
    onError: (error) => {
      const handled = onError?.(error)
      if (typeof handled === 'string') return setFormError(handled)
      if (handled) return
      if (isApiError(error, 'VALIDATION_FAILED') && error.fields.length > 0) {
        const { unmatched } = applyFieldErrors(error.fields, fields, setError, toName)
        if (unmatched === 0) return
      }
      setFormError(errorMessage(error, t.common.genericError))
    },
  })

  return {
    ...mutation,
    formError,
    setFormError,
    /** Clears the previous message, then saves. */
    submit: (variables: TVars) => {
      setFormError(null)
      mutation.mutate(variables)
    },
  }
}
