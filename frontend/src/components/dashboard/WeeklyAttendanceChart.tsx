import type { DailyAttendancePoint } from '@/api/dashboard'

function barColor(rate: number) {
  if (rate >= 90) return 'bg-emerald-500'
  if (rate >= 75) return 'bg-yellow-500'
  return 'bg-destructive'
}

export function WeeklyAttendanceChart({ data }: { data: DailyAttendancePoint[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات كافية بعد.</p>
  }

  return (
    <div className="flex h-48 items-end justify-between gap-3 px-2">
      {data.map((point) => (
        <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{point.rate}%</span>
          <div className="flex h-32 w-full items-end rounded-md bg-muted">
            <div
              className={`w-full rounded-md transition-all ${barColor(point.rate)}`}
              style={{ height: `${Math.max(point.rate, 2)}%` }}
              title={`${point.label}: ${point.present_count} من ${point.total_count} (${point.rate}%)`}
            />
          </div>
          <span className="text-xs text-muted-foreground">{point.label}</span>
        </div>
      ))}
    </div>
  )
}
