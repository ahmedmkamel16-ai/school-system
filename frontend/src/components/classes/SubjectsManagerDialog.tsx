import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCreateSubject, useDeleteSubject, useSubjects } from '@/api/subjects'

export function SubjectsManagerDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const { data: subjects } = useSubjects()
  const createSubject = useCreateSubject()
  const deleteSubject = useDeleteSubject()

  const onAdd = async () => {
    if (!name.trim()) return
    try {
      await createSubject.mutateAsync(name.trim())
      setName('')
      toast.success('تمت إضافة المادة')
    } catch {
      toast.error('تعذّرت إضافة المادة (قد تكون موجودة بالفعل)')
    }
  }

  const onDelete = async (id: number) => {
    try {
      await deleteSubject.mutateAsync(id)
      toast.success('تم حذف المادة')
    } catch {
      toast.error('تعذّر حذف المادة')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إدارة المواد الدراسية</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="اسم المادة الجديدة..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
          <Button onClick={onAdd} disabled={createSubject.isPending}>
            <Plus className="size-4" />
            إضافة
          </Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {subjects?.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد مواد بعد.</p>
          )}
          {subjects?.map((subject) => (
            <div
              key={subject.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              {subject.name}
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => onDelete(subject.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
