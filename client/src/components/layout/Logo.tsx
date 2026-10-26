import { cn } from '@/lib/utils'

/** Brand mark. Same shape as public/favicon.svg, drawn inline so it follows the theme colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('size-9', className)} aria-hidden>
      <rect width="512" height="512" rx="112" className="fill-primary" />
      <path
        className="fill-primary-foreground"
        fillRule="evenodd"
        d="M168 120h118c52 0 94 40 94 92s-42 92-94 92h-52v88h-66zM234 180v64h46c18 0 32-14 32-32s-14-32-32-32z"
      />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-lg font-bold tracking-tight text-primary">Physio</span>
    </div>
  )
}
