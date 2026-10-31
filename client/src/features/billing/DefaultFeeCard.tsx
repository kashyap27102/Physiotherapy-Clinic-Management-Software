import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName } from '@/components/common/Field'
import { OfflineNotice } from '@/components/common/OfflineNotice'
import { SectionCard } from '@/components/common/SectionCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { fromPaise, isValidAmount, toPaise } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/**
 * BILL-001: the owner's default session fee. A new fee applies to future visits only; visits already marked keep the fee
 * they were charged (BR-BILL-1), so changing it never rewrites history.
 */
export function DefaultFeeCard() {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const fee = useQuery({ queryKey: queryKeys.defaultFee, queryFn: () => api.clinic.defaultFee() })
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current = fee.data?.defaultFee ?? ''
  const text = draft ?? current
  const valid = isValidAmount(text)
  const changed = valid && toPaise(text) !== toPaise(current)

  const save = useMutation({
    mutationFn: () => api.clinic.setDefaultFee(fromPaise(toPaise(text) ?? 0)),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.defaultFee, saved)
      setDraft(null)
      toast.success(t.fee.saved)
    },
    onError: (failure) => setError(errorMessage(failure, t.common.genericError)),
  })

  return (
    <SectionCard title={t.fee.title}>
      <p className="-mt-1 mb-4 text-sm text-muted-foreground">{t.fee.body}</p>
      {fee.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : fee.isError ? (
        <FormAlert>{t.settings.loadError}</FormAlert>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            save.mutate()
          }}
        >
          <Field id="default-fee" label={t.fee.label} error={text && !valid ? t.fee.error : undefined}>
            <Input
              id="default-fee"
              className={inputClassName}
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          {!fee.data.isSet && <p className="text-sm text-muted-foreground">{t.fee.notSet}</p>}
          {error && <FormAlert>{error}</FormAlert>}
          <OfflineNotice />
          <Button type="submit" className="h-10 px-4" disabled={!changed || save.isPending || !online}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {save.isPending ? t.fee.saving : t.fee.save}
          </Button>
        </form>
      )}
    </SectionCard>
  )
}
