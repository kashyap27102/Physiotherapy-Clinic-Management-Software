import { Building2, ShieldCheck, Zap, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { t } from '@/strings/en'

const POINT_ICONS: LucideIcon[] = [Zap, Building2, ShieldCheck]

interface AuthLayoutProps {
  /** Optional icon badge above the title, for confirmation states. */
  icon?: ReactNode
  title: string
  subtitle?: ReactNode
  children: ReactNode
  /** Small print under the form, for example "Back to sign in". */
  footer?: ReactNode
}

/**
 * Split sign-in layout: a brand panel on large screens, the form on the right. On phones only the form shows,
 * with the logo on top, so the code and password fields stay within thumb reach.
 */
export function AuthLayout({ icon, title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="auth-brand relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="auth-grid pointer-events-none absolute inset-0" aria-hidden />
        <Logo tone="inverted" className="relative" />

        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-[2.75rem]">
            {t.auth.brandTagline}
          </h2>
          <ul className="mt-10 space-y-3">
            {t.auth.brandPoints.map((point, index) => {
              const Icon = POINT_ICONS[index] ?? ShieldCheck
              return (
                <li
                  key={point.title}
                  className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <div className="font-medium">{point.title}</div>
                    <div className="mt-0.5 text-sm text-white/70">{point.body}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">{t.auth.brandFooter}</p>
      </aside>

      <div className="relative flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-6">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px] animate-in duration-500 fade-in slide-in-from-bottom-2">
            {icon && <div className="mb-6">{icon}</div>}
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </main>

        <p className="flex items-center justify-center gap-1.5 px-5 pb-6 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t.auth.secureNote}
        </p>
      </div>
    </div>
  )
}

/** Round tinted badge for the icon slot of AuthLayout. */
export function AuthIcon({ children, tone = 'primary' }: { children: ReactNode; tone?: 'primary' | 'success' }) {
  const tones = {
    primary: 'bg-accent text-primary ring-primary/15',
    success: 'bg-success-soft text-success ring-success/20',
  }
  return (
    <span className={`flex size-12 items-center justify-center rounded-2xl ring-1 [&_svg]:size-6 ${tones[tone]}`}>
      {children}
    </span>
  )
}
