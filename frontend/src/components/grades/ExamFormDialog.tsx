import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateExam, useExamAssignments, useExams } from '@/api/grades'
import {
  EXAM_TYPE_LABELS,
  TERM_LABELS,
  apiErrorMessage,
  currentAcademicYear,
  formatNumber,
  isValidAcademicYear,
  normalizeAcademicYear,
  toNumber,
  type ExamType,
  type Term,
} from '@/lib/grading'

const today = () => new Date().toISOString().slice(0, 10)

interface FormState {
  pair: string // "classroomId:subjectId"
  title: string
  exam_type: ExamType
  term: Term
  academic_year: string
  exam_date: string
  max_score: string
  weight_percent: string
}

const emptyForm = (): FormState => ({
  pair: '',
  title: '',
  exam_type: 'quiz',
  term: 'first',
  academic_year: currentAcademicYear(),
  exam_date: today(),
  max_score: '100',
  weight_percent: '',
})

export function ExamFormDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const { data: assignments } = useExamAssignments(open)
  const createExam = useCreateExam()

  useEffect(() => {
    if (open) setForm(emptyForm())
  }, [open])

  const [classroomId, subjectId] = form.pair ? form.pair.split(':').map(Number) : [null, null]
  const year = normalizeAcademicYear(form.academic_year)
  const yearValid = isValidAcademicYear(year)

  // فحص سريع للأوزان: نجمع أوزان الامتحانات الموجودة لنفس (فصل، مادة، ترم، سنة) قبل الإرسال.
  const { data: siblings } = useExams(
    {
      class_id: classroomId ?? undefined,
      subject_id: subjectId ?? undefined,
      term: form.term,
      academic_year: year,
    },
    open && classroomId !== null && yearValid,
  )
  const usedWeight = useMemo(
    () => (siblings ?? []).reduce((sum, e) => sum + (toNumber(e.weight_percent) ?? 0), 0),
    [siblings],
  )
  const remaining = Math.max(0, 100 - usedWeight)

  const weight = toNumber(form.weight_percent)
  const maxScore = toNumber(form.max_score)
  const errors = {
    pair: !form.pair ? 'اختر الفصل والمادة' : null,
    title: form.title.trim().length < 2 ? 'العنوان قصير جدًا' : null,
    year: yearValid ? null : 'الصيغة: 2025-2026',
    max: maxScore === null || maxScore <= 0 || maxScore > 1000 ? 'من 0 إلى 1000' : null,
    weight:
      weight === null || weight <= 0 || weight > 100
        ? 'من 0 إلى 100'
        : weight > remaining + 1e-9 && form.pair && yearValid
          ? `يتجاوز المتبقي (${formatNumber(remaining)}%)`
          : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const onSubmit = async () => {
    if (hasErrors || classroomId === null || subjectId === null) return
    try {
      await createExam.mutateAsync({
        title: form.title.trim(),
        exam_type: form.exam_type,
        term: form.term,
        academic_year: year,
        exam_date: form.exam_date,
        max_score: form.max_score,
        weight_percent: form.weight_percent,
        classroom_id: classroomId,
        subject_id: subjectId,
      })
      toast.success('تم إنشاء الامتحان كمسودة')
      setOpen(false)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  const err = (message: string | null) =>
    message ? <p className="text-xs text-destructive">{message}</p> : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>امتحان جديد</DialogTitle>
          <DialogDescription>
            يُنشأ الامتحان كمسودة، ولا يظهر لأولياء الأمور حتى ينشره المدير.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>الفصل والمادة</Label>
            <Select
              value={form.pair}
              onValueChange={(pair) => {
                const a = assignments?.find((x) => `${x.classroom_id}:${x.subject_id}` === pair)
                setForm({
                  ...form,
                  pair,
                  academic_year: a && isValidAcademicYear(a.academic_year)
                    ? normalizeAcademicYear(a.academic_year)
                    : form.academic_year,
                })
              }}
            >
              <SelectTrigger className="w-full" aria-label="الفصل والمادة">
                <SelectValue placeholder="اختر الفصل والمادة" />
              </SelectTrigger>
              <SelectContent>
                {assignments?.map((a) => (
                  <SelectItem key={`${a.classroom_id}:${a.subject_id}`} value={`${a.classroom_id}:${a.subject_id}`}>
                    {a.classroom_name} — {a.subject_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignments?.length === 0 && (
              <p className="text-xs text-muted-foreground">لا توجد فصول أو مواد منسوبة إليك.</p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="exam_title">عنوان الامتحان</Label>
            <Input
              id="exam_title"
              placeholder="مثال: الاختبار النصفي"
              value={form.title}
              maxLength={120}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>النوع</Label>
            <Select value={form.exam_type} onValueChange={(v) => setForm({ ...form, exam_type: v as ExamType })}>
              <SelectTrigger className="w-full" aria-label="النوع">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXAM_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الفصل الدراسي</Label>
            <Select value={form.term} onValueChange={(v) => setForm({ ...form, term: v as Term })}>
              <SelectTrigger className="w-full" aria-label="الفصل الدراسي">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TERM_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam_year">العام الدراسي</Label>
            <Input
              id="exam_year"
              dir="ltr"
              className="text-right"
              placeholder="2025-2026"
              value={form.academic_year}
              onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
            />
            {err(errors.year)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam_date">تاريخ الامتحان</Label>
            <Input
              id="exam_date"
              type="date"
              value={form.exam_date}
              onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam_max">الدرجة العظمى</Label>
            <Input
              id="exam_max"
              inputMode="decimal"
              value={form.max_score}
              onChange={(e) => setForm({ ...form, max_score: e.target.value })}
            />
            {err(errors.max)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam_weight">الوزن (%)</Label>
            <Input
              id="exam_weight"
              inputMode="decimal"
              placeholder="مثال: 30"
              value={form.weight_percent}
              onChange={(e) => setForm({ ...form, weight_percent: e.target.value })}
              aria-invalid={Boolean(errors.weight) && form.weight_percent !== ''}
            />
            {form.pair && yearValid && (
              <p className="text-xs text-muted-foreground" data-testid="weight-remaining">
                المتبقي لهذه المادة: {formatNumber(remaining)}% من 100%
              </p>
            )}
            {form.weight_percent !== '' && err(errors.weight)}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={onSubmit} disabled={hasErrors || createExam.isPending}>
            {createExam.isPending ? 'جارٍ الحفظ...' : 'إنشاء الامتحان'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
