import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useImportStudents } from '@/api/students'

export function ImportStudentsDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null)
  const importStudents = useImportStudents()

  const onSubmit = async () => {
    if (!file) return
    try {
      const response = await importStudents.mutateAsync(file)
      setResult(response)
      if (response.created > 0) {
        toast.success(`تم استيراد ${response.created} طالبًا بنجاح`)
      }
      if (response.errors.length === 0) {
        setOpen(false)
      }
    } catch {
      toast.error('تعذّر استيراد الملف — تأكد من صيغة الملف')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setFile(null)
          setResult(null)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>استيراد طلاب من ملف Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            يجب أن يحتوي الملف على الأعمدة بنفس ترتيب ملف التصدير: الاسم الكامل، الرقم
            الوطني، تاريخ الميلاد، الصف الدراسي، الشعبة، العنوان، اسم ولي الأمر، هاتف ولي
            الأمر.
          </p>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border p-2 text-sm"
          />
          {result && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium text-green-600">تم إنشاء {result.created} طالب</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-destructive">
                  {result.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={!file || importStudents.isPending}>
            {importStudents.isPending ? 'جاري الاستيراد...' : 'استيراد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
