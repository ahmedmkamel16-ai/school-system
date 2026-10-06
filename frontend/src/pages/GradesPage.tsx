import { useMemo, useState } from 'react'
import { ClipboardList, FileText, Lock, Plus, Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/lib/auth'
import { useClassrooms } from '@/api/classrooms'
import { useStudents, type Student } from '@/api/students'
import {
  useChangeExamStatus,
  useExam,
  useExamAssignments,
  useExams,
  type Exam,
  type ExamFilters,
} from '@/api/grades'
import { ExamFormDialog } from '@/components/grades/ExamFormDialog'
import { GradebookGrid } from '@/components/grades/GradebookGrid'
import { ReportCardDialog } from '@/components/grades/ReportCardDialog'
import {
  EXAM_STATUS_LABELS,
  EXAM_TYPE_LABELS,
  TERM_LABELS,
  apiErrorMessage,
  currentAcademicYear,
  formatNumber,
  isValidAcademicYear,
  normalizeAcademicYear,
  toNumber,
  type ExamStatus,
  type Term,
} from '@/lib/grading'

const STATUS_BADGE: Record<ExamStatus, 'secondary' | 'default' | 'outline'> = {
  draft: 'secondary',
  published: 'default',
  locked: 'outline',
}

type View = 'exams' | 'cards'

export function GradesPage() {
  const { isLoadingUser, canManageUsers, isTeacher } = useAuth()
  const canSeeExams = canManageUsers || isTeacher
  const [view, setView] = useState<View | null>(null)

  if (isLoadingUser) return <Skeleton className="h-64 w-full" />
  const active: View = view ?? (canSeeExams ? 'exams' : 'cards')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الامتحانات والدرجات</h1>
        <div className="flex items-center gap-2">
          {canSeeExams && (
            <div className="inline-flex overflow-hidden rounded-md border" role="tablist">
              {(['exams', 'cards'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={active === v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    active === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  }`}
                >
                  {v === 'exams' ? 'الامتحانات' : 'كشوف الدرجات'}
                </button>
              ))}
            </div>
          )}
          {canSeeExams && active === 'exams' && (
            <ExamFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  امتحان جديد
                </Button>
              }
            />
          )}
        </div>
      </div>

      {active === 'exams' ? <ExamsSection /> : <ReportCardsSection />}
    </div>
  )
}

// ---------------------------------------------------------------- الامتحانات

function ExamsSection() {
  const { canManageUsers } = useAuth()
  const [filters, setFilters] = useState<ExamFilters>({})
  const { data: exams, isLoading, isError } = useExams(filters)
  const { data: assignments } = useExamAssignments()
  const [gradebookId, setGradebookId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ exam: Exam; next: ExamStatus } | null>(null)
  const changeStatus = useChangeExamStatus()

  const classrooms = useMemo(() => {
    const map = new Map<number, string>()
    assignments?.forEach((a) => map.set(a.classroom_id, a.classroom_name))
    return [...map]
  }, [assignments])
  const subjects = useMemo(() => {
    const map = new Map<number, string>()
    assignments?.forEach((a) => map.set(a.subject_id, a.subject_name))
    return [...map]
  }, [assignments])

  const counts = useMemo(() => {
    const c = { draft: 0, published: 0, locked: 0 }
    exams?.forEach((e) => (c[e.status] += 1))
    return c
  }, [exams])

  const confirmStatus = async () => {
    if (!pending) return
    try {
      await changeStatus.mutateAsync({ id: pending.exam.id, status: pending.next })
      toast.success(pending.next === 'published' ? 'تم نشر الامتحان' : 'تم إغلاق الامتحان')
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
    setPending(null)
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['الإجمالي', exams?.length ?? 0],
          [EXAM_STATUS_LABELS.draft, counts.draft],
          [EXAM_STATUS_LABELS.published, counts.published],
          [EXAM_STATUS_LABELS.locked, counts.locked],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="كل الفصول"
          value={filters.class_id?.toString()}
          onChange={(v) => setFilters({ ...filters, class_id: v ? Number(v) : undefined })}
          options={classrooms.map(([id, name]) => [String(id), name])}
        />
        <FilterSelect
          label="كل المواد"
          value={filters.subject_id?.toString()}
          onChange={(v) => setFilters({ ...filters, subject_id: v ? Number(v) : undefined })}
          options={subjects.map(([id, name]) => [String(id), name])}
        />
        <FilterSelect
          label="كل الحالات"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: (v as ExamStatus) || undefined })}
          options={Object.entries(EXAM_STATUS_LABELS)}
        />
        <FilterSelect
          label="كل الفصول الدراسية"
          value={filters.term}
          onChange={(v) => setFilters({ ...filters, term: (v as Term) || undefined })}
          options={Object.entries(TERM_LABELS)}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الامتحان</TableHead>
              <TableHead>الفصل / المادة</TableHead>
              <TableHead>الفصل الدراسي</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>العظمى / الوزن</TableHead>
              <TableHead>الرصد</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-destructive">تعذّر تحميل الامتحانات</TableCell>
              </TableRow>
            )}
            {exams?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد امتحانات</TableCell>
              </TableRow>
            )}
            {exams?.map((exam) => (
              <TableRow key={exam.id}>
                <TableCell>
                  <p className="font-medium">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">{EXAM_TYPE_LABELS[exam.exam_type]}</p>
                </TableCell>
                <TableCell>{exam.classroom_name} — {exam.subject_name}</TableCell>
                <TableCell>{TERM_LABELS[exam.term]}<br /><bdi dir="ltr" className="text-xs text-muted-foreground">{exam.academic_year}</bdi></TableCell>
                <TableCell>{exam.exam_date}</TableCell>
                <TableCell>{formatNumber(toNumber(exam.max_score) ?? 0)} / {formatNumber(toNumber(exam.weight_percent) ?? 0)}%</TableCell>
                <TableCell>{exam.graded_count} / {exam.students_count}</TableCell>
                <TableCell><Badge variant={STATUS_BADGE[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => setGradebookId(exam.id)}>
                      <ClipboardList className="size-4" />
                      الدرجات
                    </Button>
                    {canManageUsers && exam.status === 'draft' && (
                      <Button size="sm" variant="outline" onClick={() => setPending({ exam, next: 'published' })}>
                        <Send className="size-4" />
                        نشر
                      </Button>
                    )}
                    {canManageUsers && exam.status === 'published' && (
                      <Button size="sm" variant="outline" onClick={() => setPending({ exam, next: 'locked' })}>
                        <Lock className="size-4" />
                        إغلاق
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <GradebookDialog examId={gradebookId} onClose={() => setGradebookId(null)} />

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.next === 'published' ? 'نشر الامتحان؟' : 'إغلاق الامتحان؟'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.next === 'published'
                ? 'سيدخل هذا الامتحان في كشوف الدرجات، ولن يعدّل المعلم درجاته بعد النشر.'
                : 'الإغلاق نهائي: لا يمكن تعديل الامتحان ولا درجاته بعده.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatus}>تأكيد</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  options: [string, string][] | string[][]
}) {
  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? undefined : v)}>
      <SelectTrigger className="w-48" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>{l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function GradebookDialog({ examId, onClose }: { examId: string | null; onClose: () => void }) {
  const { canManageUsers } = useAuth()
  const { data: exam, isLoading, isError } = useExam(examId)
  // المعلم يعدّل المسودات فقط، والمدير يعدّل المسودة والمنشور، والمغلق للعرض.
  const canEdit =
    exam !== undefined &&
    (exam.status === 'draft' || (exam.status === 'published' && canManageUsers))

  return (
    <Dialog open={examId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{exam ? `درجات: ${exam.title}` : 'الدرجات'}</DialogTitle>
          <DialogDescription>
            {exam
              ? `${exam.classroom_name} — ${exam.subject_name} — ${EXAM_STATUS_LABELS[exam.status]}`
              : 'جارٍ التحميل...'}
          </DialogDescription>
        </DialogHeader>
        {isLoading && <Skeleton className="h-48 w-full" />}
        {isError && <p className="text-destructive">تعذّر تحميل الامتحان</p>}
        {exam && <GradebookGrid exam={exam} canEdit={canEdit} />}
      </DialogContent>
    </Dialog>
  )
}

// -------------------------------------------------------------- كشوف الدرجات

function ReportCardsSection() {
  const { isParent } = useAuth()
  const [classroomId, setClassroomId] = useState<number | undefined>()
  const [term, setTerm] = useState<Term>('first')
  const [year, setYear] = useState(currentAcademicYear())
  const [student, setStudent] = useState<Student | null>(null)
  const { data: classrooms } = useClassrooms({}, { enabled: !isParent })
  const { data: students, isLoading } = useStudents({
    classroom_id: classroomId,
    page_size: 200,
  })
  const yearOk = isValidAcademicYear(year)
  const ready = isParent || classroomId !== undefined

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        {!isParent && (
          <div className="space-y-1">
            <Label>الشعبة</Label>
            <Select
              value={classroomId?.toString() ?? ''}
              onValueChange={(v) => {
                setClassroomId(Number(v))
                // العام الدراسي يتبع الشعبة المختارة حتى لا يُعرض كشف عام آخر بالخطأ
                const classroom = classrooms?.find((c) => c.id === Number(v))
                if (classroom && isValidAcademicYear(classroom.academic_year)) {
                  setYear(normalizeAcademicYear(classroom.academic_year))
                }
              }}
            >
              <SelectTrigger className="w-48" aria-label="الشعبة">
                <SelectValue placeholder="اختر الشعبة" />
              </SelectTrigger>
              <SelectContent>
                {classrooms?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>الفصل الدراسي</Label>
          <Select value={term} onValueChange={(v) => setTerm(v as Term)}>
            <SelectTrigger className="w-44" aria-label="الفصل الدراسي">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TERM_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rc_year">العام الدراسي</Label>
          <Input
            id="rc_year"
            dir="ltr"
            className="w-36 text-right"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-invalid={!yearOk}
          />
        </div>
      </div>
      {!yearOk && <p className="text-xs text-destructive">صيغة العام الدراسي: 2025-2026</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الطالب</TableHead>
              <TableHead>الشعبة</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!ready && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">اختر الشعبة لعرض طلابها</TableCell>
              </TableRow>
            )}
            {ready && isLoading && (
              <TableRow>
                <TableCell colSpan={3}><Skeleton className="h-6 w-full" /></TableCell>
              </TableRow>
            )}
            {ready && students?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">لا يوجد طلاب</TableCell>
              </TableRow>
            )}
            {ready && students?.items.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell>{s.class_name ?? '—'}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled={!yearOk} onClick={() => setStudent(s)}>
                    <FileText className="size-4" />
                    عرض الكشف
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ReportCardDialog
        student={student}
        term={term}
        academicYear={normalizeAcademicYear(year)}
        onClose={() => setStudent(null)}
      />
    </>
  )
}
