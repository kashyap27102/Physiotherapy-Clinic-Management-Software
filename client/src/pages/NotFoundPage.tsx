import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { t } from '@/strings/en'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">{t.common.notFoundTitle}</h1>
      <p className="mt-2 text-muted-foreground">{t.common.notFoundBody}</p>
      <Link to="/" className={buttonVariants({ className: 'mt-6 h-10 px-4' })}>
        {t.common.goHome}
      </Link>
    </div>
  )
}
