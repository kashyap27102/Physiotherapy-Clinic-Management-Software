import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { t } from '@/strings/en'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={dark ? t.theme.switchToLight : t.theme.switchToDark}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  )
}
