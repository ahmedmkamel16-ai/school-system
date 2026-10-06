import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReportCard } from '@/api/grades'
import {
  OVERALL_RESULT_LABELS,
  TERM_LABELS,
  computeGpa,
  formatNumber,
  gradeFor,
  toNumber,
} from '@/lib/grading'

const RESULT_STYLES = {
  passed: 'border-emerald-600 text-emerald-700',
  failed: 'border-red-600 text-red-700',
  incomplete: 'border-amber-600 text-amber-700',
} as const

/**
 * شهادة مدرسية قابلة للطباعة. الورقة بألوان ثابتة (فاتحة) بغض النظر عن الوضع الداكن،
 * والطباعة تعتمد على قواعد @media print في index.css عبر الصنفين print-area و no-print.
 */
export function ReportCardView({
  card,
  schoolName = 'نظام إدارة المدرسة',
}: {
  card: ReportCard
  schoolName?: string
}) {
  const percentages = card.entries.map((e) => toNumber(e.weighted_percentage) ?? 0)
  const total = percentages.reduce((a, b) => a + b, 0)
  const overall = toNumber(card.overall_percentage)
  const gpa = computeGpa(percentages)
  const notes = card.entries.flatMap((e) => e.notes.map((n) => ({ subject: e.subject_name, text: n })))

  return (
    <div className="space-y-3">
      <div className="no-print flex items-center justify-between gap-2">
        {card.status === 'draft' ? (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
            مسودة — لم تُنشر لولي الأمر بعد
          </span>
        ) : (
          <span />
        )}
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" />
          طباعة الشهادة
        </Button>
      </div>

      <article
        dir="rtl"
        className="print-area mx-auto w-full max-w-3xl rounded-lg border-2 border-neutral-800 bg-white p-8 text-neutral-900"
        aria-label="شهادة الطالب"
      >
        <header className="border-b-2 border-neutral-800 pb-4 text-center">
          <p className="text-sm text-neutral-600">{schoolName}</p>
          <h2 className="mt-1 text-2xl font-bold">شهادة نتائج الطالب</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {TERM_LABELS[card.term]} — العام الدراسي <bdi dir="ltr">{card.academic_year}</bdi>
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 py-4 text-sm">
          <div>
            <span className="text-neutral-500">اسم الطالب: </span>
            <b>{card.student_name ?? '—'}</b>
          </div>
          <div>
            <span className="text-neutral-500">الشعبة: </span>
            <b>{card.classroom_name ?? '—'}</b>
          </div>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-400 p-2 text-right">المادة</th>
              <th className="border border-neutral-400 p-2 text-center">النسبة %</th>
              <th className="border border-neutral-400 p-2 text-center">التقدير</th>
              <th className="border border-neutral-400 p-2 text-center">النقاط</th>
            </tr>
          </thead>
          <tbody>
            {card.entries.length === 0 && (
              <tr>
                <td colSpan={4} className="border border-neutral-400 p-4 text-center text-neutral-500">
                  لا توجد درجات منشورة لهذا الفصل الدراسي بعد
                </td>
              </tr>
            )}
            {card.entries.map((entry, i) => {
              const pct = percentages[i]
              const grade = gradeFor(pct)
              return (
                <tr key={entry.subject_id}>
                  <td className="border border-neutral-400 p-2">{entry.subject_name}</td>
                  <td className="border border-neutral-400 p-2 text-center">{formatNumber(pct)}</td>
                  <td className="border border-neutral-400 p-2 text-center">
                    {grade.label} ({grade.letter})
                  </td>
                  <td className="border border-neutral-400 p-2 text-center">{formatNumber(grade.points, 1)}</td>
                </tr>
              )
            })}
          </tbody>
          {card.entries.length > 0 && (
            <tfoot>
              <tr className="bg-neutral-100 font-bold">
                <td className="border border-neutral-400 p-2">المجموع</td>
                <td className="border border-neutral-400 p-2 text-center" data-testid="rc-total">
                  {formatNumber(total)} / {card.entries.length * 100}
                </td>
                <td colSpan={2} className="border border-neutral-400 p-2 text-center">
                  المعدل العام: <span data-testid="rc-overall">{overall !== null ? `${formatNumber(overall)}%` : '—'}</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded-md border border-neutral-400 p-3 text-center">
            <p className="text-xs text-neutral-500">معدل GPA (من 4.0)</p>
            <p className="mt-1 text-3xl font-bold" data-testid="rc-gpa">
              {gpa !== null ? gpa.toFixed(2) : '—'}
            </p>
          </div>
          <div className={`rounded-md border-2 p-3 text-center ${RESULT_STYLES[card.overall_result]}`}>
            <p className="text-xs">النتيجة النهائية</p>
            <p className="mt-1 text-3xl font-bold" data-testid="rc-result">
              {OVERALL_RESULT_LABELS[card.overall_result]}
            </p>
          </div>
        </section>

        {notes.length > 0 && (
          <section className="mt-5 text-sm">
            <h3 className="mb-1 font-bold">ملاحظات المعلمين</h3>
            <ul className="list-disc space-y-1 pr-5">
              {notes.map((n, i) => (
                <li key={i}>
                  <b>{n.subject}</b> — {n.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 grid grid-cols-3 gap-4 text-center text-xs text-neutral-600">
          <div className="border-t border-neutral-500 pt-2">مربّي الشعبة</div>
          <div className="border-t border-neutral-500 pt-2">ولي الأمر</div>
          <div className="border-t border-neutral-500 pt-2">مدير المدرسة</div>
        </footer>
        {card.published_at && (
          <p className="mt-4 text-center text-xs text-neutral-500">
            تاريخ الإصدار: {new Date(card.published_at).toLocaleDateString('ar')}
          </p>
        )}
      </article>
    </div>
  )
}
