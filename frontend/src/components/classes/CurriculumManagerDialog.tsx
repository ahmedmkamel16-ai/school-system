import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GRADE_LEVELS } from '@/lib/constants'
import { useSubjects } from '@/api/subjects'
import { useTeachers } from '@/api/teachers'
import { useCurriculum, useDeleteCurriculum, useUpsertCurriculum } from '@/api/curriculum'

const WEEKLY_CAPACITY = 35

export function CurriculumManagerDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVELS[0])
  const [subjectId, setSubjectId] = useState('')
  const [periods, setPeriods] = useState('')
  const { data: subjects } = useSubjects()
  const { data: teachers } = useTeachers()
  const { data: requirements } = useCurriculum(gradeLevel)
  const upsert = useUpsertCurriculum()
  const del = useDeleteCurriculum()

  const totalPeriods = requirements?.reduce((sum, r) => sum + r.periods_per_week, 0) ?? 0
  const remaining = WEEKLY_CAPACITY - totalPeriods
  const overCapacity = totalPeriods > WEEKLY_CAPACITY
  const qualifiedSubjectIds = new Set(teachers?.flatMap((t) => t.subject_ids) ?? [])

  const onAdd = async () => {
    const periodsNumber = Number(periods)
    if (!subjectId || !periodsNumber || periodsNumber < 1) return
    if (periodsNumber > remaining) {
      toast.error(
        `لا يمكن إضافة ${periodsNumber} حصة — المتبقي من السعة الأسبوعية ${Math.max(remaining, 0)} حصة فقط (من أصل ${WEEKLY_CAPACITY})`,
      )
      return
    }
    try {
      await upsert.mutateAsync({
        grade_level: gradeLevel,
        subject_id: Number(subjectId),
        periods_per_week: periodsNumber,
      })
      setSubjectId('')
      setPeriods('')
      toast.success('تم حفظ متطلب المنهج')
    } catch {
      toast.error('تعذّر الحفظ')
    }
  }

  const onDelete = async (id: number) => {
    try {
      await del.mutateAsync(id)
      toast.success('تم الحذف')
    } catch {
      toast.error('تعذّر الحذف')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إدارة المنهج الدراسي</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">الصف الدراسي</label>
          <Select value={gradeLevel} onValueChange={setGradeLevel}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRADE_LEVELS.map((grade) => (
                <SelectItem key={grade} value={grade}>
                  {grade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            يُطبَّق هذا المنهج تلقائيًا على كل الشعب التابعة لهذا الصف.
          </p>
        </div>

        <div className="flex gap-2">
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="اختر المادة" />
            </SelectTrigger>
            <SelectContent>
              {subjects
                ?.filter((s) => !requirements?.some((r) => r.subject_id === s.id))
                .map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    {subject.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            max={Math.max(remaining, 1)}
            placeholder="حصص/أسبوع"
            className="w-32"
            value={periods}
            onChange={(e) => setPeriods(e.target.value)}
          />
          <Button onClick={onAdd} disabled={upsert.isPending || remaining <= 0}>
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {requirements?.length === 0 && (
            <p className="text-sm text-muted-foreground">لا يوجد منهج محدد لهذا الصف بعد.</p>
          )}
          {requirements?.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span>{req.subject_name}</span>
                {!qualifiedSubjectIds.has(req.subject_id) && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600">
                    <AlertTriangle className="size-3" />
                    لا يوجد معلم مؤهل
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{req.periods_per_week} حصة/أسبوع</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => onDelete(req.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {requirements && requirements.length > 0 && (
          <div
            className={`flex items-center gap-2 rounded-md p-2 text-xs ${
              overCapacity
                ? 'border border-destructive/50 bg-destructive/10 text-destructive'
                : 'text-muted-foreground'
            }`}
          >
            {overCapacity && <AlertTriangle className="size-4 shrink-0" />}
            <span>
              إجمالي الحصص المطلوبة أسبوعيًا: {totalPeriods} من أصل {WEEKLY_CAPACITY} حصة متاحة
              (5 أيام × 7 حصص).
              {overCapacity &&
                ' هذا يتجاوز السعة المتاحة — لن يتمكن التوليد التلقائي من إكمال الجدول!'}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
