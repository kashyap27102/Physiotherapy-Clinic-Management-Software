import { Building2, ChevronDown, Globe, LayoutDashboard, LogOut, Menu, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, useCan, useUser } from '@/auth/hooks'
import { OfflineBanner } from '@/components/common/OfflineBanner'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
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

function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter((part) => part && !part.endsWith('.'))
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const canSeeReports = useCan('report.view')
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      <NavLink to="/" end className={navLinkClass} onClick={onNavigate}>
        <Users className="size-4" aria-hidden />
        {t.nav.patients}
      </NavLink>
      {canSeeReports && (
        <NavLink to="/dashboard" className={navLinkClass} onClick={onNavigate}>
          <LayoutDashboard className="size-4" aria-hidden />
          {t.nav.dashboard}
        </NavLink>
      )}
    </nav>
  )
}

export function AppShell() {
  const user = useUser()
  const { signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Escape closes the mobile menu; link clicks close it through SidebarNav's onNavigate.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="min-h-screen bg-app md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-10 px-5 py-6 md:flex">
        <Logo className="px-1" />
        <SidebarNav />
      </aside>

      {/* Mobile sidebar */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label={t.nav.closeMenu}
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-8 bg-app px-5 py-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo />
              <Button variant="ghost" size="icon" aria-label={t.nav.closeMenu} onClick={() => setMenuOpen(false)}>
                <X aria-hidden />
              </Button>
            </div>
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:py-3 md:pr-3">
        <div className="flex flex-1 flex-col overflow-hidden bg-background md:rounded-2xl md:border md:shadow-sm">
          <OfflineBanner />
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 md:px-6">
            <Button
              variant="ghost"
              size="icon-lg"
              className="md:hidden"
              aria-label={t.nav.menu}
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden />
            </Button>
            <Logo className="md:hidden" />

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <span className="hidden items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground lg:flex">
                <Building2 className="size-4" aria-hidden />
                {user.branch ? user.branch.name : t.nav.allBranches}
              </span>
              <span className="hidden items-center gap-1.5 px-2 text-sm text-muted-foreground sm:flex">
                <Globe className="size-4" aria-hidden />
                {t.nav.language}
              </span>
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-10 items-center gap-2 rounded-lg pl-1 pr-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {initials(user.fullName)}
                  </span>
                  <span className="hidden max-w-36 truncate font-medium sm:inline">{user.fullName}</span>
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
                  <DropdownMenuItem onClick={() => void signOut()}>
                    <LogOut className="size-4" aria-hidden />
                    {t.common.signOut}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
