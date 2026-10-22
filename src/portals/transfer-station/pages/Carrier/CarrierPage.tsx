/**
 * وحدة ناقلات الحاويات المكبسية — المحطة التحويلية (00330):
 *  · الخروج بالقوائم فقط: آلية محطة ← سائق (موظف/خارجي/متعاقد) ← وجهة. لا كتابة يدوية للأسماء.
 *  · التتبع: الوصول يُسجَّل آلياً عند دخول زون الوجهة إن كان للآلية GPS، وإلا يُوسم «بلا تتبع».
 *  · البيانات تصل غرفة العمليات ضمن التقرير اليومي ومنها إلى المعاون (لا إرسال مباشر).
 */
import { useState } from 'react'
import { useCarrierList } from '@features/transfer-station'
import { StationTable } from '@components/station/StationTable'
import { currentMonth, monthLabel } from '@components/station/station.utils'
import { Icon } from '@components/ui/Icon/Icon'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { StationExitForm } from '@portals/transfer-station/components/StationExitForm'

export default function CarrierPage() {
  const [month, setMonth] = useState(currentMonth())
  const list = useCarrierList(month)
  const records = list.data ?? []
  return (
    <div className="space-y-5" data-testid="carrier-page">
      <ExecPageHeader icon="truck" title="ناقلات الحاويات المكبسية" subtitle="تسجيل خروج ناقلات الحاويات المكبسية — بالقوائم فقط؛ الوزن إلزامي والوصول يُسجَّل آلياً من GPS" />
      <StationExitForm kind="carrier" defaultWeight="16" />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Icon name="folder" size={16} className="text-brand-600" />
        <span className="text-sm font-bold text-slate-700">سجلات الشهر</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="carrier-month" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <span className="text-xs text-slate-500">{monthLabel(month)} — {records.length} سجل</span>
        <span className="ms-auto text-[11px] text-slate-400">تصل غرفة العمليات تلقائياً ضمن التقرير اليومي ومنها إلى المعاون</span>
      </div>
      <StationTable kind="carrier" records={records} personLabel="السائق" withDestination />
    </div>
  )
}
