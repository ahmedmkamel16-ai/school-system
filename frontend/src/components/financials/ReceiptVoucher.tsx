import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Receipt } from '@/api/financials'
import { PAYMENT_METHOD_LABELS, RECEIPT_KIND_LABELS, formatMoney, verifyUrl } from '@/lib/finance'

type Paper = 'A5' | 'A4'

function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { margin: 1, width: 192, errorCorrectionLevel: 'M' }).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [value])
  return src ? <img src={src} alt="رمز التحقق من السند" className="size-24" data-testid="receipt-qr" /> : <div className="size-24" />
}

/**
 * سند القبض الجاهز للطباعة (A5 أو A4) مع QR اختياري. الورقة فاتحة دائمًا،
 * وقواعد الطباعة العامة (.print-area / .no-print) في index.css؛ مقاس الصفحة يُضبط هنا.
 */
export function ReceiptVoucherPanel({ receipt, schoolName = 'نظام إدارة المدرسة' }: { receipt: Receipt; schoolName?: string }) {
  const [paper, setPaper] = useState<Paper>('A5')
  const [withQr, setWithQr] = useState(true)
  const reversal = receipt.kind === 'reversal'

  return (
    <div className="space-y-3">
      <style media="print">{`@page { size: ${paper} portrait; margin: 8mm; }`}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label>الورق</Label>
            <Select value={paper} onValueChange={(v) => setPaper(v as Paper)}>
              <SelectTrigger className="w-24" aria-label="مقاس الورق">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A5">A5</SelectItem>
                <SelectItem value="A4">A4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="qr_toggle" checked={withQr} onCheckedChange={setWithQr} />
            <Label htmlFor="qr_toggle">رمز QR</Label>
          </div>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          طباعة السند
        </Button>
      </div>

      <article
        dir="rtl"
        className="print-area mx-auto w-full max-w-xl rounded-lg border-2 border-neutral-800 bg-white p-6 text-neutral-900"
        aria-label="سند القبض"
      >
        <header className="flex items-start justify-between border-b-2 border-neutral-800 pb-3">
          <div>
            <p className="text-sm text-neutral-600">{schoolName}</p>
            <h2 className={`mt-1 text-2xl font-bold ${reversal ? 'text-red-700' : ''}`}>{RECEIPT_KIND_LABELS[receipt.kind]}</h2>
          </div>
          <div className="text-left text-sm" dir="ltr">
            <p className="font-mono text-base font-bold" data-testid="receipt-number">{receipt.receipt_number}</p>
            <p className="text-neutral-600">{receipt.paid_at}</p>
          </div>
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-4 text-sm">
          <dt className="text-neutral-500">الطالب</dt>
          <dd className="font-bold">{receipt.student_name ?? '—'}</dd>
          <dt className="text-neutral-500">البند</dt>
          <dd>{receipt.fee_name ?? '—'}</dd>
          <dt className="text-neutral-500">طريقة الدفع</dt>
          <dd>
            {PAYMENT_METHOD_LABELS[receipt.method]}
            {receipt.reference && <span className="mr-2 font-mono text-xs text-neutral-600" dir="ltr">({receipt.reference})</span>}
          </dd>
          {receipt.allocations.length > 0 && (
            <>
              <dt className="text-neutral-500">الأقساط المسددة</dt>
              <dd>{receipt.allocations.map((a) => `القسط ${a.installment_no}`).join('، ')}</dd>
            </>
          )}
          {reversal && (
            <>
              <dt className="text-neutral-500">سبب العكس</dt>
              <dd>{receipt.reversal_reason}</dd>
            </>
          )}
          {receipt.note && (
            <>
              <dt className="text-neutral-500">ملاحظة</dt>
              <dd>{receipt.note}</dd>
            </>
          )}
          <dt className="text-neutral-500">المحصِّل</dt>
          <dd>{receipt.collected_by_name ?? '—'}</dd>
        </dl>

        <div className={`flex items-center justify-between rounded-md border-2 p-3 ${reversal ? 'border-red-700 text-red-700' : 'border-neutral-800'}`}>
          <span className="text-sm">{reversal ? 'المبلغ المعكوس' : 'المبلغ المستلم'}</span>
          <span className="text-2xl font-bold" data-testid="receipt-amount">{formatMoney(receipt.amount)}</span>
        </div>
        {receipt.is_reversed && (
          <p className="mt-2 text-center text-sm font-bold text-red-700">هذا السند معكوس (ملغى) بسند عكس لاحق</p>
        )}

        <footer className="mt-6 flex items-end justify-between">
          <div className="grid flex-1 grid-cols-2 gap-6 text-center text-xs text-neutral-600">
            <div className="border-t border-neutral-500 pt-2">توقيع المحصِّل</div>
            <div className="border-t border-neutral-500 pt-2">توقيع المستلِم منه</div>
          </div>
          {withQr && (
            <div className="mr-6 text-center">
              <Qr value={verifyUrl(receipt)} />
              <p className="text-[10px] text-neutral-500">للتحقق من صحة السند</p>
            </div>
          )}
        </footer>
      </article>
    </div>
  )
}

export function ReceiptVoucherDialog({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  return (
    <Dialog open={receipt !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="no-print">
          <DialogTitle>{receipt ? `${RECEIPT_KIND_LABELS[receipt.kind]} ${receipt.receipt_number}` : 'السند'}</DialogTitle>
          <DialogDescription>معاينة السند وطباعته</DialogDescription>
        </DialogHeader>
        {receipt && <ReceiptVoucherPanel receipt={receipt} />}
      </DialogContent>
    </Dialog>
  )
}
