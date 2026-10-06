import { describe, expect, it } from 'vitest'
import { formatMoney, verifyUrl } from './finance'

describe('formatMoney', () => {
  it('فواصل الآلاف مع العملة', () => {
    expect(formatMoney('150000.00')).toBe('150,000 د.ع')
    expect(formatMoney(1234.5)).toBe('1,234.5 د.ع')
    expect(formatMoney(null)).toBe('0 د.ع')
  })
})

describe('verifyUrl', () => {
  it('يرمّز الرقم والرمز في رابط الصفحة العامة', () => {
    const url = new URL(verifyUrl({ receipt_number: 'R-2026-000001', verification_code: 'abc123' }))
    expect(url.pathname).toBe('/verify-receipt')
    expect(url.searchParams.get('number')).toBe('R-2026-000001')
    expect(url.searchParams.get('code')).toBe('abc123')
  })
})
