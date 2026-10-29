/**
 * Page numbers to show: always the first and last, the current one with a neighbour each side, a gap (null) where pages
 * are skipped. A gap of a single page shows that page instead, since "…" would take the same room.
 */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  const sorted = [...wanted].sort((a, b) => a - b)
  const result: (number | null)[] = []
  sorted.forEach((n, i) => {
    const previous = sorted[i - 1]
    if (previous !== undefined && n - previous > 1) result.push(n - previous === 2 ? n - 1 : null)
    result.push(n)
  })
  return result
}
