import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { inputClassName } from '@/components/common/Field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

/** Password field with a show/hide toggle. Accepts every Input prop, including react-hook-form's register(). */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn(inputClassName, 'pr-11', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}
