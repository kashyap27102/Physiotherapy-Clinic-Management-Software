import { ChevronLeft, ChevronRight } from 'lucide-react'
import { pageWindow } from '@/lib/pagination'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  pageSizes?: readonly number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const pageButton =
  'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40'

/** "1–25 of 132", rows per page, and previous / numbered / next page buttons. */
export function Pagination({
  page,
  pageSize,
  total,
  pageSizes = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row sm:px-5">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span aria-live="polite">{t.home.pagination.showing(from, to, total)}</span>
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">{t.home.pagination.perPage}</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label={t.home.pagination.perPage}
            className="h-8 cursor-pointer rounded-md border border-input bg-transparent px-1.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav aria-label={t.home.pagination.label} className="flex items-center gap-1">
        <button
          type="button"
          className={cn(pageButton, 'hover:bg-muted')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t.home.pagination.previous}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        {pageWindow(page, pages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={cn(pageButton, n === page ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted')}
              aria-label={t.home.pagination.page(n)}
              aria-current={n === page ? 'page' : undefined}
              onClick={() => onPageChange(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className={cn(pageButton, 'hover:bg-muted')}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t.home.pagination.next}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </nav>
    </div>
  )
}
