/**
 * مكونات معاينة تقرير الشكاوى — تعكس هيئة شرائح ملف PowerPoint المنتج.
 * الصيغ والخطة المشتركة في `reportPreviewModel.ts`.
 */
import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { authorityLineFor, coverDateLine, siteCaption, type ReportEntry, type ReportLayout } from './reportPreviewModel'

export function ReportPreviewImage({ title, src, accent }: { title: string; src?: string; accent: string }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  return <div className="overflow-hidden rounded-lg border">
    <div className="p-1 text-center text-[8px] font-bold text-white sm:text-xs" style={{ background: accent }}>{title}</div>
    {showImage
      ? <img src={src} alt={title} onError={() => setFailed(true)} className="aspect-[4/3] w-full bg-slate-100 object-contain" />
      : <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-slate-100 text-[8px] text-slate-400 sm:text-xs"><ImageIcon size={18} /><span>الصورة غير متاحة</span></div>}
  </div>
}

export function ReportCoverPreview({ layout, title, accent, sector, reportDate }: {
  layout: ReportLayout; title: string; accent: string; sector: string; reportDate: string
}) {
  return <div className="flex h-full flex-col items-center justify-center p-5 text-center">
    <div className="flex items-center gap-3">
      <img src="/icons/baghdad-municipality.png" alt="شعار أمانة بغداد" className="size-12 object-contain sm:size-16" />
      <img src="/icons/alliance.png" alt="شعار التحالف" className="size-14 object-contain sm:size-20" />
      <img src="/icons/logo.png" alt="شعار جزيرة الأكرام" className="size-14 object-contain sm:size-20" />
    </div>
    <p className="mt-3 text-[9px] font-bold sm:text-xs">{authorityLineFor(layout, sector)}</p>
    <p className="mt-1 text-[8px] font-bold sm:text-[11px]">{String(layout.contractorLine ?? 'تحالف شركات جزيرة الأكرام وفيرست ترايد')}</p>
    <h3 className="mt-4 max-w-2xl text-base font-black sm:text-2xl" style={{ color: accent }}>{String(layout.title ?? title)}</h3>
    <p className="mt-2 max-w-2xl text-[9px] font-bold text-slate-700 sm:text-sm">{title}</p>
    <p className="mt-2 text-[10px] font-bold sm:text-sm">{coverDateLine(sector, reportDate)}</p>
  </div>
}

export function ReportSummaryPreview({ entries, afterPhotos, accent }: { entries: ReportEntry[]; afterPhotos: number; accent: string }) {
  const approved = entries.filter(entry => entry.item.status === 'approved').length
  const centers = new Map<string, number>()
  entries.forEach(entry => {
    const name = entry.item.municipalCenter || 'غير محدد'
    centers.set(name, (centers.get(name) ?? 0) + 1)
  })
  const rows = [...centers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = Math.max(1, ...rows.map(([, count]) => count))
  return <div className="h-full overflow-y-auto p-3 sm:p-5">
    <h3 className="text-center text-xs font-black sm:text-lg" style={{ color: accent }}>المؤشرات التنفيذية للتقرير</h3>
    <div className="mt-3 grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-2 text-center"><p className="text-[7px] font-bold text-sky-800 sm:text-[11px]">إجمالي المواقع</p><p className="text-sm font-black text-sky-900 sm:text-2xl">{entries.length}</p></div>
      <div className="rounded-xl border border-green-200 bg-green-50 p-2 text-center"><p className="text-[7px] font-bold text-green-800 sm:text-[11px]">المواقع المعتمدة</p><p className="text-sm font-black text-green-900 sm:text-2xl">{approved}</p></div>
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-2 text-center"><p className="text-[7px] font-bold text-purple-800 sm:text-[11px]">صور المعالجة</p><p className="text-sm font-black text-purple-900 sm:text-2xl">{afterPhotos}</p></div>
    </div>
    <p className="mt-4 text-center text-[8px] font-bold text-slate-600 sm:text-xs">توزيع المواقع حسب المركز البلدي</p>
    <div className="mt-2 space-y-1.5">
      {rows.length === 0 && <p className="text-center text-[8px] text-slate-400">لا توجد مواقع مضمنة بعد.</p>}
      {rows.map(([name, count]) => <div key={name} className="flex items-center gap-2 text-[7px] font-bold sm:text-[11px]">
        <span className="w-20 truncate text-slate-600 sm:w-28">{name}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 sm:h-2.5"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, (count / max) * 100)}%`, background: accent }} /></span>
        <span className="w-5 text-left text-slate-800">{count}</span>
      </div>)}
    </div>
  </div>
}

export function ReportTablePreview({ entries, accent, managerNames }: { entries: ReportEntry[]; accent: string; managerNames: Map<string, string> }) {
  return <div className="h-full overflow-y-auto p-3 sm:p-5">
    <h3 className="text-center text-xs font-black sm:text-lg" style={{ color: accent }}>جدول بيانات التلكؤات</h3>
    <table className="mt-3 w-full table-fixed text-[6px] sm:text-[10px]">
      <thead style={{ background: accent, color: 'white' }}><tr><th className="p-1">ت</th><th>مسؤول القسم</th><th>نوع التلكؤ</th><th>المركز</th><th>المحلة</th><th>الزقاق</th></tr></thead>
      <tbody>{entries.slice(0, 11).map((entry, index) => <tr key={entry.itemId} className="border-b odd:bg-slate-50">
        <td className="p-1 text-center">{index + 1}</td>
        <td>{managerNames.get(entry.item.assignedTo ?? '') ?? 'مسؤول القسم'}</td>
        <td>{entry.item.title || '—'}</td>
        <td>{entry.item.municipalCenter || '—'}</td>
        <td>{entry.item.neighborhood || '—'}</td>
        <td>{entry.item.alley || '—'}</td>
      </tr>)}</tbody>
    </table>
    {entries.length > 11 && <p className="mt-2 text-center text-[8px] text-slate-500">+ {entries.length - 11} موقع في الصفحات التالية</p>}
  </div>
}

export function ReportSlidePreview({ entry, before, after, accent, layout, groupNote }: {
  entry?: ReportEntry; before?: string; after?: string; accent: string; layout: ReportLayout; groupNote?: string
}) {
  if (!entry) return <div className="flex h-full items-center justify-center text-sm text-slate-400">لا توجد مواقع مضمنة</div>
  return <div className="flex h-full flex-col p-3">
    {groupNote && <p className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50 p-1.5 text-center text-[7px] font-black text-indigo-800 sm:text-[11px]">تسبق هذه الشريحة شريحة فاصل: {groupNote}</p>}
    <div className="grid grid-cols-2 gap-3">
      <ReportPreviewImage title={String(layout.afterLabel ?? 'صورة المعالجة')} src={after} accent={accent} />
      <ReportPreviewImage title={String(layout.beforeLabel ?? 'صورة التلكؤ')} src={before} accent={accent} />
    </div>
    <p className="mt-auto rounded-lg bg-slate-100 p-2 text-center text-[8px] font-bold sm:text-xs">{siteCaption(entry)}</p>
  </div>
}
