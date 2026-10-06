import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useReverseReceipt, type Receipt } from '@/api/financials'
import { formatMoney } from '@/lib/finance'
import { apiErrorMessage } from '@/lib/grading'

/** عكس سند: لا يُعدَّل السند الأصلي أبدًا، بل يصدر سند عكس جديد بسبب موثَّق (للمدير). */
export function ReverseReceiptDialog({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const reverse = useReverseReceipt()
  useEffect(() => setReason(''), [receipt])

  const submit = async () => {
    if (!receipt) return
    try {
      const result = await reverse.mutateAsync({ id: receipt.id, reason: reason.trim() })
      toast.success(`صدر سند العكس ${result.receipt_number}`)
      onClose()
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  return (
    <Dialog open={receipt !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>عكس السند {receipt?.receipt_number}</DialogTitle>
          <DialogDescription>
            سيصدر سند عكس بمبلغ {receipt ? formatMoney(receipt.amount) : ''} ويُعاد رصيد الطالب وأقساطه. السند الأصلي يبقى كما هو.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rev_reason">سبب العكس (إلزامي)</Label>
          <Input id="rev_reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>تراجع</Button>
          <Button variant="destructive" onClick={submit} disabled={reason.trim().length < 5 || reverse.isPending}>
            تأكيد العكس
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
