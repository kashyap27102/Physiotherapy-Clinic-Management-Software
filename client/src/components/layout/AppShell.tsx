import {
  Building2,
  ChevronDown,
  Ellipsis,
  Globe,
  KeyRound,
  LayoutDashboard,
  Landmark,
  LogOut,
  Moon,
  ScrollText,
  ShieldCheck,
  Store,
  Sun,
  Users,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAnyCan, useAuth, useCan, useUser } from '@/auth/hooks'
import { BranchScopeProvider } from '@/branchScope/BranchScopeProvider'
import { BranchSelect } from '@/components/layout/BranchSelect'
import { initials } from '@/lib/forms'
import { OfflineBanner } from '@/components/common/OfflineBanner'
import { Logo, LogoMark } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Dialog as DrawerPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-sidebar-accent',
  )

// Phone "More" sheet: bigger rows, finger-sized.
const sheetLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-12 items-center gap-3 rounded-lg px-3 text-base font-medium',
    isActive ? 'bg-accent text-primary' : 'active:bg-muted',
  )
const sheetRow =
  'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base font-medium outline-none active:bg-muted focus-visible:bg-muted'
const sectionLabel = 'mt-6 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase'

/**
 * The sidebar list. `sheet` is the "More" list on phones: Dashboard and Patients live in the bottom bar there, so only
 * the rest shows, in bigger rows.
 */
function SidebarNav({ onNavigate, sheet }: { onNavigate?: () => void; sheet?: boolean }) {
  const canSeeDashboard = useAnyCan('patient.view', 'report.view')
  const canSeePatients = useCan('patient.view')
  const canSeeFinance = useCan('finance.view')
  const canManageClinic = useCan('clinic.manage')
  const canManageStaff = useCan('staff.manage')
  const canManageRoles = useCan('role.manage')
  const canSeeAudit = useCan('audit.view')
  const linkClass = sheet ? sheetLinkClass : navLinkClass
  const iconClass = sheet ? 'size-5' : 'size-4'
  const settings = [
    canManageClinic && { to: '/settings/clinic', icon: Store, label: t.settings.clinic },
    canManageClinic && { to: '/settings/branches', icon: Building2, label: t.settings.branches },
    canManageStaff && { to: '/settings/staff', icon: UsersRound, label: t.settings.staff },
    canManageRoles && { to: '/settings/roles', icon: KeyRound, label: t.settings.roles },
  ].filter((item) => item !== false)

  return (
    <nav className="flex flex-col gap-1" aria-label={sheet ? t.nav.moreTitle : t.nav.main}>
      {canSeeDashboard && !sheet && (
        <NavLink to="/dashboard" className={linkClass} onClick={onNavigate}>
          <LayoutDashboard className={iconClass} aria-hidden />
          {t.nav.dashboard}
        </NavLink>
      )}
      {canSeePatients && !sheet && (
        <NavLink to="/patients" className={linkClass} onClick={onNavigate}>
          <Users className={iconClass} aria-hidden />
          {t.nav.patients}
        </NavLink>
      )}
      {canSeeFinance && !sheet && (
        <NavLink to="/finance" className={linkClass} onClick={onNavigate}>
          <Landmark className={iconClass} aria-hidden />
          {t.nav.finance}
        </NavLink>
      )}
      {canSeeAudit && (
        <>
          <div className={cn(sectionLabel, sheet && 'mt-2')}>{t.nav.auditSection}</div>
          <NavLink to="/audit-log" className={linkClass} onClick={onNavigate}>
            <ScrollText className={iconClass} aria-hidden />
            {t.nav.auditLog}
          </NavLink>
        </>
      )}
      {settings.length > 0 && (
        <>
          <div className={cn(sectionLabel, sheet && 'mt-2')}>{t.settings.section}</div>
          {settings.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={linkClass} onClick={onNavigate}>
              <Icon className={iconClass} aria-hidden />
              {label}
            </NavLink>
          ))}
        </>
      )}
    </nav>
  )
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium outline-none transition-colors focus-visible:bg-muted',
    isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
  )

/** Phones: the two places used all day sit in a labelled bar under the thumb; the rest is behind "More". */
function BottomNav({ onMore }: { onMore: () => void }) {
  const canSeeDashboard = useAnyCan('patient.view', 'report.view')
  const canSeePatients = useCan('patient.view')
  const canSeeFinance = useCan('finance.view')
  return (
    <nav
      aria-label={t.nav.main}
      className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {canSeeDashboard && (
        <NavLink to="/dashboard" className={tabClass}>
          <LayoutDashboard className="size-5" aria-hidden />
          {t.nav.dashboard}
        </NavLink>
      )}
      {canSeePatients && (
        <NavLink to="/patients" className={tabClass}>
          <Users className="size-5" aria-hidden />
          {t.nav.patients}
        </NavLink>
      )}
      {canSeeFinance && (
        <NavLink to="/finance" className={tabClass}>
          <Landmark className="size-5" aria-hidden />
          {t.nav.finance}
        </NavLink>
      )}
      <button type="button" onClick={onMore} className={tabClass({ isActive: false })}>
        <Ellipsis className="size-5" aria-hidden />
        {t.nav.more}
      </button>
    </nav>
  )
}

/** Phones and tablets: audit, settings, theme, account and sign out in a drawer from the right edge (the top-bar menu is hidden there). */
function MoreDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useUser()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const close = () => onOpenChange(false)

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 lg:hidden" />
        {/* A drawer that slides in from the right edge, full height; never a centred modal. */}
        <DrawerPrimitive.Popup className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col gap-1 overflow-y-auto overscroll-contain bg-popover px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] text-popover-foreground shadow-xl outline-none duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right lg:hidden">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DrawerPrimitive.Title className="text-base font-semibold">{t.nav.moreTitle}</DrawerPrimitive.Title>
              <p className="truncate text-sm text-muted-foreground">
                {user.fullName} · {t.roles[user.role]}
              </p>
            </div>
            <DrawerPrimitive.Close render={<Button variant="ghost" size="icon-lg" className="size-10" />}>
              <X aria-hidden />
              <span className="sr-only">{t.nav.closeMenu}</span>
            </DrawerPrimitive.Close>
          </div>
          <SidebarNav onNavigate={close} sheet />
          <div className={cn(sectionLabel, 'mt-2 border-t pt-4')}>{t.nav.account}</div>
          <button
            type="button"
            className={sheetRow}
            onClick={() => {
              close()
              void navigate('/account/security')
            }}
          >
            <ShieldCheck className="size-5" aria-hidden />
            {t.security.menuLink}
          </button>
          <button type="button" className={sheetRow} onClick={() => setTheme(dark ? 'light' : 'dark')}>
            {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
            {dark ? t.theme.switchToLight : t.theme.switchToDark}
          </button>
          <button type="button" className={sheetRow} onClick={() => void signOut()}>
            <LogOut className="size-5" aria-hidden />
            {t.common.signOut}
          </button>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}

export function AppShell() {
  const user = useUser()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <BranchScopeProvider>
      <div className="min-h-dvh bg-app lg:flex">
        {/* Desktop and tablet sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-10 px-5 py-6 lg:flex">
          <Logo className="px-1" />
          <SidebarNav />
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:min-h-screen lg:py-3 lg:pr-3">
          <div className="flex flex-1 flex-col overflow-hidden bg-background lg:rounded-2xl lg:border lg:shadow-sm">
            <OfflineBanner />
            <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur lg:static lg:h-16 lg:px-6">
              <LogoMark className="shrink-0 lg:hidden" />
              <BranchSelect className="min-w-0 flex-1 sm:w-52 sm:flex-none" />

              {/* The account menu, theme and language are in the "More" sheet on phones. */}
              <div className="ml-auto hidden items-center gap-1 sm:gap-2 lg:flex">
                <span className="hidden items-center gap-1.5 px-2 text-sm text-muted-foreground lg:flex">
                  <Globe className="size-4" aria-hidden />
                  {t.nav.language}
                </span>
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-10 items-center gap-2 rounded-lg pl-1 pr-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {initials(user.fullName)}
                    </span>
                    <span className="hidden max-w-36 truncate font-medium lg:inline">{user.fullName}</span>
                    <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>
                        <div className="text-sm font-medium text-foreground">{user.fullName}</div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {t.roles[user.role]} · {user.branch ? user.branch.name : t.nav.allBranches}
                        </div>
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void navigate('/account/security')}>
                      <ShieldCheck className="size-4" aria-hidden />
                      {t.security.menuLink}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void signOut()}>
                      <LogOut className="size-4" aria-hidden />
                      {t.common.signOut}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            {/* Phones leave room for the bottom bar and the home-indicator strip. */}
            <main className="flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-6">
              <Outlet />
            </main>
          </div>
        </div>

        <BottomNav onMore={() => setMoreOpen(true)} />
        <MoreDrawer open={moreOpen} onOpenChange={setMoreOpen} />
      </div>
    </BranchScopeProvider>
  )
}
