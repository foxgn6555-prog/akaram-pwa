/** المدير التنفيذي — «تعديلات الحضور» (00397-ج): قراءة فقط — المؤشرات الشهرية والسجل والتفاصيل قبل/بعد. */
import { useState } from 'react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { MonthPicker } from '@portals/hr/components/hr-ui'
import { monthStart } from '@portals/hr/components/hr-format'
import { useAttendanceEditList, useAttendanceEditStats } from '@features/attendance-edits'
import { ListFilters, RequestDetailDialog, RequestsTable, useListFilters } from '@features/attendance-edits/components/AttendanceEditShared'
import { StatsBlock } from '@portals/deputy/pages/AttendanceEdits/DeputyAttendanceEditsPage'

export default function ExecAttendanceEditsPage() {
  const [month, setMonth] = useState(monthStart())
  const [openId, setOpenId] = useState<string | null>(null)
  const { data: stats } = useAttendanceEditStats(month)
  const { f, setF, query } = useListFilters()
  const { data: rows = [], isLoading } = useAttendanceEditList(query)
  return (
    <div className="space-y-4" data-testid="exec-attendance-edits">
      <ExecPageHeader icon="calendar" title="تعديلات الحضور" subtitle="اطّلاع فقط: من عدّل حضور من، متى، ولماذا — وكم دقيقة صُحّحت. التراجع من صلاحية المعاون." />
      <MonthPicker value={month} onChange={setMonth} testId="ae-month" />
      <StatsBlock s={stats} />
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">السجل</h3><ListFilters f={f} setF={setF} /></div>
      {isLoading ? <LoadingSpinner /> : <RequestsTable rows={rows} onOpen={(r) => setOpenId(r.id)} />}
      {openId && <RequestDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
