import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExamDetail } from '@/api/grades'
import { GradebookGrid } from './GradebookGrid'

const post = vi.fn()
vi.mock('@/api/client', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const exam: ExamDetail = {
  id: 'e1', title: 'نصفي', exam_type: 'midterm', term: 'first', academic_year: '2025-2026', exam_date: '2025-12-01',
  max_score: '50.00', weight_percent: '60.00', status: 'draft', subject_id: 1, classroom_id: 1,
  classroom_name: 'أ', subject_name: 'رياضيات', students_count: 3, graded_count: 1,
  rows: [
    { student_id: 1, student_name: 'سارة', result_id: 'r1', status: 'graded', score: '40.00', teacher_note: null, internal_note: 'سري' },
    { student_id: 2, student_name: 'عمر', result_id: null, status: null, score: null, teacher_note: null, internal_note: null },
    { student_id: 3, student_name: 'نور', result_id: null, status: null, score: null, teacher_note: null, internal_note: null },
  ],
}

function setup(canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <GradebookGrid exam={exam} canEdit={canEdit} />
    </QueryClientProvider>,
  )
  return { user }
}

const scoreInput = (name: string) => screen.getByLabelText(`درجة ${name}`) as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: /^حفظ/ })

describe('GradebookGrid', () => {
  beforeEach(() => post.mockReset().mockResolvedValue({ data: {} }))

  it('يعرض الدرجات الحالية ويبدأ الحفظ معطّلًا (لا تغييرات)', () => {
    setup()
    expect(scoreInput('سارة').value).toBe('40')
    expect(scoreInput('عمر').value).toBe('')
    expect(saveButton()).toBeDisabled()
  })

  it('Enter ينقل التركيز للطالب التالي، و Shift+Enter للسابق', async () => {
    const { user } = setup()
    await user.click(scoreInput('سارة'))
    await user.keyboard('{Enter}')
    expect(scoreInput('عمر')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(scoreInput('نور')).toHaveFocus()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(scoreInput('عمر')).toHaveFocus()
  })

  it('Tab ينتقل بين خانات الدرجات متجاوزًا الملاحظات', async () => {
    const { user } = setup()
    await user.click(scoreInput('سارة'))
    await user.tab()
    expect(scoreInput('عمر')).toHaveFocus()
  })

  it('يمنع تجاوز الدرجة العظمى ويعطّل الحفظ', async () => {
    const { user } = setup()
    await user.click(scoreInput('عمر'))
    await user.keyboard('55')
    expect(screen.getByText('لا تتجاوز 50')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    await user.clear(scoreInput('عمر'))
    await user.keyboard('50')
    expect(screen.queryByText('لا تتجاوز 50')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('يتجاهل الأحرف والإشارات غير الرقمية', async () => {
    const { user } = setup()
    await user.click(scoreInput('عمر'))
    await user.keyboard('4a2-.5e')
    expect(scoreInput('عمر').value).toBe('42.5') // الأحرف والإشارات تُتجاهل، والكسر العشري يبقى
  })

  it('غائب/معفى يعطّل الحقل ويمسح الدرجة، والعودة لحاضر تعيد التفعيل', async () => {
    const { user } = setup()
    const group = screen.getByRole('group', { name: 'حالة سارة' })
    await user.click(group.querySelector('button[aria-pressed="false"]') as HTMLElement) // غائب
    expect(scoreInput('سارة')).toBeDisabled()
    expect(scoreInput('سارة').value).toBe('')
    await user.click(screen.getByRole('group', { name: 'حالة سارة' }).querySelectorAll('button')[0])
    expect(scoreInput('سارة')).toBeEnabled()
  })

  it('يرسل الصفوف المعدَّلة فقط ويحافظ على الملاحظة الداخلية الموجودة', async () => {
    const { user } = setup()
    await user.click(scoreInput('عمر'))
    await user.keyboard('45')
    await user.click(screen.getByRole('group', { name: 'حالة نور' }).querySelectorAll('button')[2]) // معفى
    await user.click(saveButton())
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [path, body] = post.mock.calls[0] as [string, { results: Record<string, unknown>[] }]
    expect(path).toBe('/exams/e1/results/bulk')
    expect(body.results).toEqual([
      { student_id: 2, status: 'graded', score: '45', teacher_note: null, internal_note: null },
      { student_id: 3, status: 'excused', score: null, teacher_note: null, internal_note: null },
    ])
  })

  it('تعديل درجة موجودة يُبقي internal_note الأصلية', async () => {
    const { user } = setup()
    await user.clear(scoreInput('سارة'))
    await user.keyboard('42')
    await user.click(saveButton())
    await waitFor(() => expect(post).toHaveBeenCalled())
    const body = post.mock.calls[0][1] as { results: Record<string, unknown>[] }
    expect(body.results).toEqual([{ student_id: 1, status: 'graded', score: '42', teacher_note: null, internal_note: 'سري' }])
  })

  it('للقراءة فقط: لا حفظ ولا تعديل', () => {
    setup(false)
    expect(screen.queryByRole('button', { name: /^حفظ/ })).not.toBeInTheDocument()
    expect(scoreInput('سارة')).toBeDisabled()
  })
})
