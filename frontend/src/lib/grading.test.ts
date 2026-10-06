import { describe, expect, it } from 'vitest'
import {
  apiErrorCode,
  apiErrorMessage,
  computeGpa,
  currentAcademicYear,
  formatNumber,
  gradeFor,
  isValidAcademicYear,
  normalizeAcademicYear,
  toNumber,
} from './grading'

describe('gradeFor (التقدير بالكلمات)', () => {
  it.each([
    [100, 'ممتاز'], [90, 'ممتاز'], [89.99, 'جيد جدًا'], [80, 'جيد جدًا'], [79.99, 'جيد'], [70, 'جيد'],
    [69.99, 'متوسط'], [60, 'متوسط'], [59.99, 'مقبول'], [50, 'مقبول'], [49.99, 'راسب'], [0, 'راسب'],
  ])('%s → %s', (percentage, label) => {
    expect(gradeFor(percentage).label).toBe(label)
  })

  it('لا يستخدم أحرفًا في أي تقدير', () => {
    for (const p of [95, 85, 75, 65, 55, 10]) expect(Object.keys(gradeFor(p))).not.toContain('letter')
  })
})

describe('computeGpa', () => {
  it('متوسط نقاط المواد من 4.0', () => {
    expect(computeGpa([95, 85, 55])).toBeCloseTo((4 + 3.5 + 2) / 3)
    expect(computeGpa([68])).toBe(2.5)
  })
  it('بلا مواد ⇒ null', () => expect(computeGpa([])).toBeNull())
})

describe('العام الدراسي', () => {
  it('يبدأ العام في سبتمبر', () => {
    expect(currentAcademicYear(new Date(2026, 7, 31))).toBe('2025-2026')
    expect(currentAcademicYear(new Date(2026, 8, 1))).toBe('2026-2027')
  })
  it('يطبّع الصيغة ويتحقق من تتالي السنتين', () => {
    expect(normalizeAcademicYear(' 2025/2026 ')).toBe('2025-2026')
    expect(isValidAcademicYear('2025/2026')).toBe(true)
    expect(isValidAcademicYear('2025-2027')).toBe(false)
    expect(isValidAcademicYear('abc')).toBe(false)
  })
})

describe('أدوات الأرقام', () => {
  it('toNumber / formatNumber', () => {
    expect(toNumber('12.50')).toBe(12.5)
    expect(toNumber('')).toBeNull()
    expect(toNumber(null)).toBeNull()
    expect(toNumber('x')).toBeNull()
    expect(formatNumber(50)).toBe('50')
    expect(formatNumber(42.5)).toBe('42.5')
    expect(formatNumber(33.333, 2)).toBe('33.33')
  })
})

describe('أخطاء الـ API', () => {
  const err = (detail: unknown) => ({ response: { data: { detail } } })
  it('نص / كائن {code,message} / قائمة / pydantic / غير معروف', () => {
    expect(apiErrorMessage(err('خطأ'))).toBe('خطأ')
    expect(apiErrorMessage(err({ code: 'financial_hold', message: 'يرجى مراجعة الحسابات' }))).toBe('يرجى مراجعة الحسابات')
    expect(apiErrorMessage(err(['أ', 'ب']))).toBe('أ (+1 أخطاء أخرى)')
    expect(apiErrorMessage(err([{ msg: 'قيمة سيئة' }]))).toBe('قيمة سيئة')
    expect(apiErrorMessage(new Error('x'), 'افتراضي')).toBe('افتراضي')
  })
  it('apiErrorCode', () => {
    expect(apiErrorCode(err({ code: 'financial_hold', message: 'm' }))).toBe('financial_hold')
    expect(apiErrorCode(err('نص'))).toBeNull()
    expect(apiErrorCode(undefined)).toBeNull()
  })
})
