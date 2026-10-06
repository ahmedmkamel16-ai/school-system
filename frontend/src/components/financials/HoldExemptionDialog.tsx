import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetHoldExemption } from '@/api/financials'
import { apiErrorMessage } from '@/lib/grading'

/** استثناء طالب من الحجب المالي (للمدير فقط): تُعرض شهادته رغم المتأخرات، والسبب إلزامي وموثَّق. */
export function HoldExemptionDialog({
  studentId,
  exempt,
  notes,
}: {
  studentId: number
  exempt: boolean
  notes: string | null
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const mutation = useSetHoldExemption()
  useEffect(() => {
    if (open) setText(notes ?? '')
  }, [open, notes])

  const apply = async (next: boolean) => {
    try {
      await mutation.mutateAsync({ studentId, exempt: next, notes: next ? text.trim() : null })
      toast.success(next ? 'تم استثناء الطالب من الحجب المالي' : 'أُلغي الاستثناء')
      setOpen(false)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldCheck className="size-4" />
          {exempt ? 'تعديل الاستثناء' : 'استثناء من الحجب'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>الاستثناء من الحجب المالي</DialogTitle>
          <DialogDescription>
            يُسمح بعرض شهادة الطالب لولي أمره رغم الأقساط المتأخرة. يبقى الدين مسجَّلًا ويُوثَّق الاستثناء باسمك وسببه.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="hold_notes">سبب الاستثناء (إلزامي)</Label>
          <Input id="hold_notes" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <DialogFooter>
          {exempt && (
            <Button variant="outline" onClick={() => apply(false)} disabled={mutation.isPending}>
              إلغاء الاستثناء
            </Button>
          )}
          <Button onClick={() => apply(true)} disabled={text.trim().length < 5 || mutation.isPending}>
            {exempt ? 'حفظ' : 'تفعيل الاستثناء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
