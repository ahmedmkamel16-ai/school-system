import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useAuditLog } from '@/api/audit'

const ACTION_LABELS: Record<string, string> = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  import: 'استيراد',
  bulk_move: 'نقل جماعي',
  reset_password: 'إعادة تعيين كلمة مرور',
}

const ENTITY_LABELS: Record<string, string> = {
  student: 'طالب',
  teacher: 'معلم',
  classroom: 'شعبة',
  user: 'مستخدم',
  attendance: 'حضور',
}

export function AuditLogPage() {
  const { data: entries, isLoading, isError } = useAuditLog()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">سجل النشاطات</h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ والوقت</TableHead>
              <TableHead>من قام بالإجراء</TableHead>
              <TableHead>الإجراء</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>التفاصيل</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">
                  تعذّر الاتصال بالخادم.
                </TableCell>
              </TableRow>
            )}
            {entries?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  لا توجد أي نشاطات مسجّلة بعد.
                </TableCell>
              </TableRow>
            )}
            {entries?.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString('ar-EG')}
                </TableCell>
                <TableCell className="font-medium">{entry.actor_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </Badge>
                </TableCell>
                <TableCell>{ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}</TableCell>
                <TableCell>{entry.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
