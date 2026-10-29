import { Building2, ChevronDown } from 'lucide-react'
import { useBranchScope } from '@/branchScope/context'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

/** Top-bar branch choice: "All branches" or one branch. Lists across the app follow it. */
export function BranchSelect({ className }: { className?: string }) {
  const { branchId, branches, setBranchId } = useBranchScope()

  return (
    <label
      className={cn(
        'relative flex h-10 items-center rounded-lg border bg-card text-sm shadow-xs transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/60',
        branchId && 'border-primary/40 bg-primary/5',
        className,
      )}
    >
      <span className="sr-only">{t.nav.branchSelect}</span>
      <Building2
        className={cn(
          'pointer-events-none absolute left-3 size-4',
          branchId ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-hidden
      />
      <select
        value={branchId ?? ''}
        onChange={(event) => setBranchId(event.target.value || null)}
        className="h-full w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg bg-transparent pr-8 pl-9 font-medium outline-none"
      >
        <option value="">{t.nav.allBranches}</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" aria-hidden />
    </label>
  )
}
