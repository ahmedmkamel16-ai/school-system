import { useState } from 'react'
import { Eye, EyeOff, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generatePassword } from '@/lib/password'

export function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)

  const onGenerate = async () => {
    const generated = generatePassword()
    onChange(generated)
    setVisible(true)
    try {
      await navigator.clipboard.writeText(generated)
      toast.success('تم توليد كلمة المرور ونسخها — لا تنسَ مشاركتها مع المستخدم')
    } catch {
      toast.success('تم توليد كلمة المرور — انسخها لمشاركتها مع المستخدم')
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pl-9"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 left-2 flex items-center text-muted-foreground"
            tabIndex={-1}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={onGenerate} title="توليد كلمة مرور عشوائية">
          <Wand2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}
