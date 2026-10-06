import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useSaveResults, type ExamDetail, type ResultInput } from '@/api/grades'
import { RESULT_STATUS_LABELS, apiErrorMessage, formatNumber, toNumber, type ResultStatus } from '@/lib/grading'

interface RowState {
  status: ResultStatus
  score: string
  teacher_note: string
  internal_note: string
}

const SCORE_PATTERN = /^\d{0,4}(\.\d{0,2})?$/
const STATUS_ORDER: ResultStatus[] = ['graded', 'absent', 'excused']

function initialState(exam: ExamDetail): Record<number, RowState> {
  const state: Record<number, RowState> = {}
  for (const row of exam.rows) {
    state[row.student_id] = {
      status: row.status ?? 'graded',
      score: row.score !== null ? String(toNumber(row.score)) : '',
      teacher_note: row.teacher_note ?? '',
      internal_note: row.internal_note ?? '',
    }
  }
  return state
}

/** شبكة إدخال درجات فصل كامل: Enter/Tab/الأسهم للتنقل، حالة الطالب بزر ثلاثي، وحماية من تجاوز الدرجة العظمى. */
export function GradebookGrid({
  exam,
  canEdit,
  onSaved,
}: {
  exam: ExamDetail
  canEdit: boolean
  onSaved?: () => void
}) {
  const [initial, setInitial] = useState(() => initialState(exam))
  const [state, setState] = useState(initial)
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const inputs = useRef(new Map<number, HTMLInputElement>())
  const save = useSaveResults(exam.id)
  const max = toNumber(exam.max_score) ?? 0

  // عند وصول بيانات جديدة من الخادم (بعد الحفظ) نعيد ضبط الحالة المرجعية.
  useEffect(() => {
    const fresh = initialState(exam)
    setInitial(fresh)
    setState(fresh)
  }, [exam])

  const rowError = (id: number): string | null => {
    const row = state[id]
    if (row.status !== 'graded') return null
    const had = exam.rows.find((r) => r.student_id === id)?.result_id
    if (row.score === '') return had ? 'أدخل الدرجة أو غيّر الحالة' : null
    const n = toNumber(row.score)
    if (n === null) return 'درجة غير صالحة'
    if (n > max) return `لا تتجاوز ${formatNumber(max)}`
    return null
  }

  const isDirty = (id: number) => JSON.stringify(state[id]) !== JSON.stringify(initial[id])
  const dirtyIds = exam.rows.map((r) => r.student_id).filter(isDirty)
  const errorCount = exam.rows.filter((r) => rowError(r.student_id)).length
  const entered = exam.rows.filter((r) => {
    const s = state[r.student_id]
    return s.status !== 'graded' || s.score !== ''
  }).length
  const scores = exam.rows
    .map((r) => state[r.student_id])
    .filter((s) => s.status === 'graded' && s.score !== '')
    .map((s) => Number(s.score))
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  const update = (id: number, patch: Partial<RowState>) =>
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const setStatus = (id: number, status: ResultStatus) =>
    update(id, status === 'graded' ? { status } : { status, score: '' })

  const focusRelative = (id: number, delta: 1 | -1) => {
    const ids = exam.rows.map((r) => r.student_id)
    let i = ids.indexOf(id) + delta
    while (i >= 0 && i < ids.length) {
      const el = inputs.current.get(ids[i])
      if (el && !el.disabled) {
        el.focus()
        el.select()
        return
      }
      i += delta
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, id: number) => {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusRelative(id, event.shiftKey ? -1 : 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusRelative(id, -1)
    }
  }

  const onSave = async () => {
    setServerErrors([])
    const payload: ResultInput[] = dirtyIds.map((id) => {
      const s = state[id]
      return {
        student_id: id,
        status: s.status,
        score: s.status === 'graded' ? s.score : null,
        teacher_note: s.teacher_note.trim() || null,
        internal_note: s.internal_note.trim() || null,
      }
    })
    try {
      await save.mutateAsync(payload)
      toast.success(`تم حفظ ${payload.length} سجل`)
      onSaved?.()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setServerErrors(Array.isArray(detail) ? detail.map(String) : [apiErrorMessage(error)])
      toast.error('تعذّر حفظ الدرجات')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap gap-4 text-muted-foreground">
          <span>الدرجة العظمى: <b className="text-foreground">{formatNumber(max)}</b></span>
          <span>المُدخَل: <b className="text-foreground">{entered}</b> / {exam.rows.length}</span>
          {average !== null && (
            <span>المتوسط: <b className="text-foreground">{formatNumber(average)}</b></span>
          )}
        </div>
        {canEdit && (
          <Button onClick={onSave} disabled={dirtyIds.length === 0 || errorCount > 0 || save.isPending}>
            <Save className="size-4" />
            {save.isPending ? 'جارٍ الحفظ...' : `حفظ (${dirtyIds.length})`}
          </Button>
        )}
      </div>

      {!canEdit && (
        <p className="rounded-md border bg-muted/50 p-2 text-sm text-muted-foreground">
          الدرجات للعرض فقط في هذه الحالة.
        </p>
      )}
      {errorCount > 0 && (
        <p className="text-sm text-destructive" role="alert">
          يوجد {errorCount} صف به خطأ؛ صحّحه قبل الحفظ.
        </p>
      )}
      {serverErrors.length > 0 && (
        <ul className="list-disc space-y-1 pr-5 text-sm text-destructive" role="alert">
          {serverErrors.slice(0, 5).map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

      <div className="max-h-[55vh] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>الطالب</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="w-36">الدرجة / {formatNumber(max)}</TableHead>
              <TableHead>ملاحظة (تظهر لولي الأمر)</TableHead>
              <TableHead>ملاحظة داخلية</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exam.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  لا يوجد طلاب في هذا الفصل
                </TableCell>
              </TableRow>
            )}
            {exam.rows.map((row, index) => {
              const s = state[row.student_id]
              const error = rowError(row.student_id)
              const disabled = !canEdit || s.status !== 'graded'
              return (
                <TableRow key={row.student_id} className={cn(isDirty(row.student_id) && 'bg-amber-50 dark:bg-amber-950/20')}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{row.student_name}</TableCell>
                  <TableCell>
                    <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label={`حالة ${row.student_name}`}>
                      {STATUS_ORDER.map((status) => (
                        <button
                          key={status}
                          type="button"
                          tabIndex={-1}
                          disabled={!canEdit}
                          aria-pressed={s.status === status}
                          onClick={() => setStatus(row.student_id, status)}
                          className={cn(
                            'px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed',
                            s.status === status
                              ? status === 'graded'
                                ? 'bg-primary text-primary-foreground'
                                : status === 'absent'
                                  ? 'bg-destructive text-white'
                                  : 'bg-amber-500 text-white'
                              : 'hover:bg-accent',
                          )}
                        >
                          {RESULT_STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      ref={(el) => {
                        if (el) inputs.current.set(row.student_id, el)
                        else inputs.current.delete(row.student_id)
                      }}
                      dir="ltr"
                      className={cn('h-8 w-28 text-center', error && 'border-destructive')}
                      inputMode="decimal"
                      aria-label={`درجة ${row.student_name}`}
                      aria-invalid={Boolean(error)}
                      disabled={disabled}
                      placeholder={s.status === 'graded' ? '—' : RESULT_STATUS_LABELS[s.status]}
                      value={s.score}
                      onChange={(e) => SCORE_PATTERN.test(e.target.value) && update(row.student_id, { score: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, row.student_id)}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      maxLength={500}
                      tabIndex={-1}
                      disabled={!canEdit}
                      aria-label={`ملاحظة ${row.student_name}`}
                      value={s.teacher_note}
                      onChange={(e) => update(row.student_id, { teacher_note: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      maxLength={500}
                      tabIndex={-1}
                      disabled={!canEdit}
                      aria-label={`ملاحظة داخلية ${row.student_name}`}
                      value={s.internal_note}
                      onChange={(e) => update(row.student_id, { internal_note: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter أو ↓ للطالب التالي، Shift+Enter أو ↑ للسابق، Tab للدرجة التالية (حقول الملاحظات بالنقر). الصفوف المعدَّلة فقط تُرسل عند الحفظ.
      </p>
    </div>
  )
}
