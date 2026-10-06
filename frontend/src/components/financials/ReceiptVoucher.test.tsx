import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { VoucherReceipt } from '@/api/financials'
import { ReceiptVoucherPanel } from './ReceiptVoucher'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }))

const staffReceipt: VoucherReceipt = {
  receipt_number: 'R-2026-000007', kind: 'payment', student_name: 'سارة علي', fee_name: 'الرسوم الدراسية',
  amount: '150000.00', amount_in_words: 'مائة وخمسون ألف دينار فقط لا غير', method: 'transfer', paid_at: '2026-10-06',
  verification_code: 'abc', is_reversed: false, reference: 'TRX-9', collected_by_name: 'المحاسب', allocations: [{ installment_no: 1 }],
}

describe('ReceiptVoucherPanel', () => {
  it('يعرض الرقم والمبلغ والتفقيط وQR والمحصّل والمرجع', async () => {
    render(<ReceiptVoucherPanel receipt={staffReceipt} />)
    expect(screen.getByTestId('receipt-number')).toHaveTextContent('R-2026-000007')
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('150,000 د.ع')
    expect(screen.getByTestId('receipt-words')).toHaveTextContent('مائة وخمسون ألف دينار فقط لا غير')
    expect(await screen.findByTestId('receipt-qr')).toBeInTheDocument()
    expect(screen.getByText('المحصِّل')).toBeInTheDocument()
    expect(screen.getByText('(TRX-9)')).toBeInTheDocument()
  })

  it('مفتاح QR يخفي الرمز', async () => {
    const user = userEvent.setup()
    render(<ReceiptVoucherPanel receipt={staffReceipt} />)
    await screen.findByTestId('receipt-qr')
    await user.click(screen.getByLabelText('رمز QR'))
    expect(screen.queryByTestId('receipt-qr')).not.toBeInTheDocument()
  })

  it('نسخة ولي الأمر: بلا محصِّل ولا مرجع', () => {
    const { reference: _r, collected_by_name: _c, allocations: _a, ...guardianView } = staffReceipt
    render(<ReceiptVoucherPanel receipt={guardianView} />)
    expect(screen.queryByText('المحصِّل')).not.toBeInTheDocument()
    expect(screen.queryByText(/TRX-9/)).not.toBeInTheDocument()
    expect(screen.getByTestId('receipt-words')).toBeInTheDocument()
  })

  it('سند العكس بعنوان وسبب', () => {
    render(<ReceiptVoucherPanel receipt={{ ...staffReceipt, kind: 'reversal', reversal_reason: 'إدخال خاطئ' }} />)
    expect(screen.getByRole('heading', { name: 'سند عكس' })).toBeInTheDocument()
    expect(screen.getByText('إدخال خاطئ')).toBeInTheDocument()
  })
})
