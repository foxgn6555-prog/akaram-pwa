/**
 * وحدة السكسات والنسافات الخارجة — المحطة التحويلية (00330):
 *  · الخروج بالقوائم فقط: آلية محطة ← سائق (موظف/خارجي/متعاقد) ← وجهة. لا كتابة يدوية للأسماء.
 *  · التتبع: الوصول يُسجَّل آلياً عند دخول زون الوجهة إن كان للآلية GPS، وإلا يُوسم «بلا تتبع».
 *  · البيانات تصل غرفة العمليات ضمن التقرير اليومي ومنها إلى المعاون (لا إرسال مباشر).
 */
import { useState } from 'react'
import { useSaksatList, useTripsList } from '@features/transfer-station'
import { StationTable } from '@components/station/StationTable'
import { currentMonth, monthLabel } from '@components/station/station.utils'
import { Icon } from '@components/ui/Icon/Icon'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { StationExitForm } from '@portals/transfer-station/components/StationExitForm'

export default function SaksatPage() {
  const [month, setMonth] = useState(currentMonth())
  const list = useSaksatList(month)
  const records = list.data ?? []
  const legacy = useTripsList(month)   // 00332: جدول النسافات القديم — للقراءة فقط
  const legacyRows = legacy.data ?? []
  const [showLegacy, setShowLegacy] = useState(false)
  return (
    <div className="space-y-5" data-testid="saksat-page">
      <ExecPageHeader icon="send" title="السكسات والنسافات الخارجة" subtitle="تسجيل خروج السكسات والنسافات من المحطة التحويلية — بالقوائم فقط؛ الوصول إلى الوجهة يُسجَّل آلياً من GPS" />
      <StationExitForm kind="saksat" defaultWeight="10" />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Icon name="folder" size={16} className="text-brand-600" />
        <span className="text-sm font-bold text-slate-700">سجلات الشهر</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="saksat-month" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <span className="text-xs text-slate-500">{monthLabel(month)} — {records.length} سجل</span>
        <span className="ms-auto text-[11px] text-slate-400">تصل غرفة العمليات تلقائياً ضمن التقرير اليومي ومنها إلى المعاون</span>
      </div>
      <StationTable kind="saksat" records={records} personLabel="السائق" withDestination />
      {legacyRows.length > 0 && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4" data-testid="saksat-legacy">
          <button type="button" onClick={() => setShowLegacy((v) => !v)} data-testid="saksat-legacy-toggle" className="flex w-full items-center gap-2 text-start text-sm font-bold text-slate-700">
            <Icon name="archive-box" size={16} className="text-slate-500" />
            سجلات النسافات القديمة (قبل التوحيد) — {legacyRows.length} سجل
            <span className="ms-auto text-[11px] font-normal text-slate-500">{showLegacy ? 'إخفاء' : 'عرض'} · للقراءة فقط</span>
          </button>
          {showLegacy && <div className="mt-3"><StationTable kind="trips" records={legacyRows} personLabel="اسم السائق" /></div>}
        </section>
      )}
    </div>
  )
}
