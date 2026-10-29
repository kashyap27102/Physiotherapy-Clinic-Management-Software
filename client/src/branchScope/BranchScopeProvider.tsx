import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { api } from '@/api'
import { useUser } from '@/auth/hooks'
import { queryKeys } from '@/lib/queryKeys'
import { BranchScopeContext, type BranchScope } from './context'

/** The choice is a per-browser convenience; storage can be unavailable (private windows), so every access is guarded. */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Not remembered; the choice still holds until the page is reloaded.
  }
}

/** Holds the top-bar branch choice for everything inside the app shell, remembered per user on this browser. */
export function BranchScopeProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const storageKey = `physio.branchScope.${user.id}`
  const [chosen, setChosen] = useState<string | null>(() => readStored(storageKey))
  const branches = useQuery({ queryKey: queryKeys.branches, queryFn: () => api.branches.list() })

  const value = useMemo<BranchScope>(() => {
    const active = branches.data?.filter((b) => b.isActive) ?? []
    // A remembered branch that has since closed (or is not the user's any more) falls back to every branch.
    const branch = active.find((b) => b.id === chosen) ?? null
    return {
      branchId: branches.data ? (branch?.id ?? null) : chosen,
      branch,
      branches: active,
      setBranchId: (id) => {
        setChosen(id)
        writeStored(storageKey, id)
      },
    }
  }, [branches.data, chosen, storageKey])

  return <BranchScopeContext.Provider value={value}>{children}</BranchScopeContext.Provider>
}
