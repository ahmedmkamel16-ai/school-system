import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { verifyReceipt, type ReceiptVerification } from '@/api/financials'
import { RECEIPT_KIND_LABELS, formatMoney } from '@/lib/finance'

/** صفحة عامة يفتحها مسح QR على السند: تعرض صحة السند وبياناته الدنيا فقط، دون أي تسجيل دخول. */
export function VerifyReceiptPage() {
  const [params] = useSearchParams()
  const number = params.get('number') ?? ''
  const code = params.get('code') ?? ''
  const [result, setResult] = useState<ReceiptVerification | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!number || !code) {
      setResult({ valid: false, receipt_number: null, kind: null, amount: null, paid_at: null, reversed: null })
      return
    }
    verifyReceipt(number, code).then(setResult).catch(() => setFailed(true))
  }, [number, code])

  return (
    <div className="mx-auto flex min-h-svh max-w-md items-center justify-center p-6" dir="rtl">
      <div className="w-full space-y-3 rounded-xl border p-6 text-center">
        <h1 className="text-lg font-bold">التحقق من سند</h1>
        {failed && <p className="text-destructive">تعذّر الاتصال بالخادم</p>}
        {!failed && !result && <p className="text-muted-foreground">جارٍ التحقق...</p>}
        {result?.valid && (
          <div className="space-y-2" data-testid="verify-valid">
            <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
            <p className="font-bold text-emerald-700">السند صحيح</p>
            <p className="font-mono" dir="ltr">{result.receipt_number}</p>
            <p>{result.kind && RECEIPT_KIND_LABELS[result.kind]} — <b>{formatMoney(result.amount)}</b></p>
            <p className="text-sm text-muted-foreground">{result.paid_at}</p>
            {result.reversed && <p className="font-bold text-red-700">تنبيه: هذا السند معكوس (ملغى)</p>}
          </div>
        )}
        {result && !result.valid && (
          <div className="space-y-2" data-testid="verify-invalid">
            <XCircle className="mx-auto size-12 text-red-600" />
            <p className="font-bold text-red-700">السند غير صحيح أو غير موجود</p>
          </div>
        )}
      </div>
    </div>
  )
}
