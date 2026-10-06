import { useEffect, useState, type ReactNode } from 'react'
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
import { useClassrooms } from '@/api/classrooms'
import { useCreateFeeStructure, useCreatePlan, useFeeStructures } from '@/api/financials'
import { useAuth } from '@/lib/auth'
import { GRADE_LEVELS } from '@/lib/constants'
import {
  TERM_LABELS,
  apiErrorMessage,
  currentAcademicYear,
  isValidAcademicYear,
  normalizeAcademicYear,
  toNumber,
  type Term,
} from '@/lib/grading'
import { formatMoney, todayIso } from '@/lib/finance'

const WHOLE_YEAR = 'year'

/** إنشاء رسم مقرر لصف دراسي (المدير فقط). */
export function FeeStructureDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [year, setYear] = useState(currentAcademicYear())
  const [term, setTerm] = useState<string>(WHOLE_YEAR)
  const [total, setTotal] = useState('')
  const [maxDiscount, setMaxDiscount] = useState('0')
  const create = useCreateFeeStructure()

  useEffect(() => {
    if (open) {
      setName(''); setGrade(''); setTotal(''); setMaxDiscount('0'); setTerm(WHOLE_YEAR)
    }
  }, [open])

  const valid =
    name.trim().length >= 2 && grade !== '' && isValidAcademicYear(year) &&
    (toNumber(total) ?? 0) > 0 && (toNumber(maxDiscount) ?? -1) >= 0 && (toNumber(maxDiscount) ?? 0) <= 100

  const submit = async () => {
    try {
      await create.mutateAsync({
        name: name.trim(), grade_level: grade, academic_year: normalizeAcademicYear(year),
        term: term === WHOLE_YEAR ? null : (term as Term), total_amount: total, max_discount_percent: maxDiscount,
      })
      toast.success('تم إنشاء الرسم المقرر')
      setOpen(false)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>رسم مقرر جديد</DialogTitle>
          <DialogDescription>مبلغ الرسوم لصف دراسي، وأقصى نسبة خصم مسموحة عليه.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fs_name">اسم الرسم</Label>
            <Input id="fs_name" placeholder="مثال: الرسوم الدراسية" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>الصف الدراسي</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="w-full" aria-label="الصف الدراسي"><SelectValue placeholder="اختر الصف" /></SelectTrigger>
              <SelectContent>{GRADE_LEVELS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fs_year">العام الدراسي</Label>
            <Input id="fs_year" dir="ltr" className="text-right" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>الفترة</Label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger className="w-full" aria-label="الفترة"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_YEAR}>العام كاملًا</SelectItem>
                {Object.entries(TERM_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fs_total">المبلغ الإجمالي (د.ع)</Label>
            <Input id="fs_total" inputMode="decimal" dir="ltr" className="text-right" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fs_discount">أقصى خصم مسموح (%)</Label>
            <Input id="fs_discount" inputMode="decimal" dir="ltr" className="text-right" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** تعيين رسم مع جدول أقساط متساوية لفصل كامل (أو لطالب واحد) مع خصم اختياري (للمدير). */
export function PlanDialog({ trigger, studentId }: { trigger: ReactNode; studentId?: number }) {
  const { canManageUsers } = useAuth()
  const [open, setOpen] = useState(false)
  const [structureId, setStructureId] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [count, setCount] = useState('3')
  const [firstDue, setFirstDue] = useState(todayIso())
  const [interval, setInterval_] = useState('1')
  const [discount, setDiscount] = useState('0')
  const [reason, setReason] = useState('')
  const { data: structures } = useFeeStructures(open)
  const { data: classrooms } = useClassrooms({}, { enabled: open && studentId === undefined })
  const create = useCreatePlan()

  useEffect(() => {
    if (open) { setStructureId(''); setClassroomId(''); setDiscount('0'); setReason('') }
  }, [open])

  const structure = structures?.find((s) => s.id === structureId)
  const matching = classrooms?.filter((c) => !structure || c.grade_level === structure.grade_level)
  const discountValue = toNumber(discount) ?? -1
  const total = toNumber(structure?.total_amount) ?? 0
  const net = total - (total * Math.max(discountValue, 0)) / 100
  const n = Number(count)
  const errors = {
    discount:
      discountValue < 0 || discountValue > 100 ? 'من 0 إلى 100'
        : structure && discountValue > (toNumber(structure.max_discount_percent) ?? 0) ? `أقصى خصم لهذا الرسم ${structure.max_discount_percent}%`
          : discountValue > 0 && !reason.trim() ? 'سبب الخصم مطلوب' : null,
  }
  const valid = Boolean(structure) && (studentId !== undefined || classroomId !== '') && n >= 1 && n <= 24 && !errors.discount

  const submit = async () => {
    if (!structure) return
    try {
      const result = await create.mutateAsync({
        fee_structure_id: structure.id,
        ...(studentId !== undefined ? { student_id: studentId } : { classroom_id: Number(classroomId) }),
        discount_percent: String(discountValue),
        discount_reason: discountValue > 0 ? reason.trim() : null,
        schedule: { count: n, first_due_date: firstDue, interval_months: Number(interval) },
      })
      toast.success(`تم تعيين الرسم لـ ${result.created_student_ids.length} طالب` + (result.skipped_student_ids.length ? ` (تخطّي ${result.skipped_student_ids.length} لديهم الرسم)` : ''))
      setOpen(false)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>تعيين رسوم وأقساط</DialogTitle>
          <DialogDescription>يُنشأ الجدول بمعاملة واحدة؛ إن فشل أي طالب لا يُحفظ شيء.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>الرسم المقرر</Label>
            <Select value={structureId} onValueChange={setStructureId}>
              <SelectTrigger className="w-full" aria-label="الرسم المقرر"><SelectValue placeholder="اختر الرسم" /></SelectTrigger>
              <SelectContent>
                {structures?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — {s.grade_level} — {formatMoney(s.total_amount)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {studentId === undefined && (
            <div className="space-y-2 sm:col-span-2">
              <Label>الفصل</Label>
              <Select value={classroomId} onValueChange={setClassroomId}>
                <SelectTrigger className="w-full" aria-label="الفصل"><SelectValue placeholder="اختر الفصل" /></SelectTrigger>
                <SelectContent>
                  {matching?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name} — {c.grade_level}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="pl_count">عدد الأقساط</Label>
            <Input id="pl_count" type="number" min={1} max={24} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pl_interval">كل (أشهر)</Label>
            <Input id="pl_interval" type="number" min={1} max={12} value={interval} onChange={(e) => setInterval_(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pl_first">تاريخ استحقاق القسط الأول</Label>
            <Input id="pl_first" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </div>
          {canManageUsers && (
            <>
              <div className="space-y-2">
                <Label htmlFor="pl_discount">الخصم (%)</Label>
                <Input id="pl_discount" inputMode="decimal" dir="ltr" className="text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                {errors.discount && <p className="text-xs text-destructive">{errors.discount}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl_reason">سبب الخصم</Label>
                <Input id="pl_reason" disabled={discountValue <= 0} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </>
          )}
          {structure && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              الصافي لكل طالب: <b className="text-foreground">{formatMoney(net)}</b> على {n || '—'} قسط.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>إنشاء الأقساط</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
