import { createContext, useContext } from 'react'
import type { Branch } from '@/api'

/** The branch chosen in the top bar. Lists such as patients show only that branch's records; null means every branch. */
export interface BranchScope {
  branchId: string | null
  branch: Branch | null
  /** Active branches the user can choose from (staff see only their own). */
  branches: Branch[]
  setBranchId: (id: string | null) => void
}

export const BranchScopeContext = createContext<BranchScope>({
  branchId: null,
  branch: null,
  branches: [],
  setBranchId: () => {},
})

export const useBranchScope = (): BranchScope => useContext(BranchScopeContext)
