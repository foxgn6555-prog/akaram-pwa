/**
 * المدير التنفيذي — وحدة «فعاليات الشركة» (00189)
 *  · التصاميم المكتملة من بوابة الإعلام (يومي/أسبوعي/نصفي/شهري) تصل هنا تلقائياً — المكتمل فقط
 *  · فلاتر: نطاق التاريخ · القاطع · نوع الفترة · بحث بالعنوان/نوع العمل
 *  · فتح التصميم بملء الشاشة للقراءة فقط + تصدير (HTML / PDF / PowerPoint) + طباعة نظيفة
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { field } from '@portals/hr/components/hr-format'
import { PERIOD_LABEL, SECTOR_LABEL, type PeriodType, type SectorParent } from '@features/media/constants'
import { useDesignDetail, useSignedPhotoUrls } from '@features/media/hooks'
import { useCompletedDesigns } from '@features/treasury/hooks'
import { DateRangeFilter, fmtDateTime, type DateRange } from '@features/treasury/components/TreasuryShared'
import type { CompletedDesignRow } from '@sdk/treasury.sdk'
import DesignReportView, { type ReportColors, type ReportStyle, type ReportSummary } from '@portals/media/pages/Designs/DesignReportView'
import DesignExportMenu from '@portals/media/pages/Designs/DesignExportMenu'

const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ar-IQ-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ExecEventsPage() {
  const [range, setRange] = useState<DateRange>({ from: '', to: '' })
  const [sector, setSector] = useState<SectorParent | ''>('')
  const [period, setPeriod] = useState<PeriodType | ''>('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useCompletedDesigns({ from: range.from || null, to: range.to || null, sector: sector || null, periodType: period || null })
  const rows = useMemo(() => {
    const q = search.trim()
    return (list.data ?? []).filter((d) => !q || d.title.includes(q) || d.work_types.some((w) => w.includes(q)))
  }, [list.data, search])
  const coverPaths = useMemo(() => rows.map((r) => r.cover_image_path).filter((p): p is string => Boolean(p)), [rows])
  const covers = useSignedPhotoUrls(coverPaths)

  return (
    <div className="space-y-4" data-testid="exec-events-page">
      <header>
        <h1 className="text-lg font-black text-slate-800">فعاليات الشركة</h1>
        <p className="text-xs text-slate-500">التصاميم المكتملة من قسم الإعلام تصل هنا تلقائياً · افتح أي فعالية لعرضها أو تصديرها أو طباعتها</p>
      </header>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <DateRangeFilter value={range} onChange={setRange} testId="ev-range" />
          <div className="flex flex-wrap items-end gap-2">
            <select className={clsx(field, 'w-40')} value={sector} onChange={(e) => setSector(e.target.value as SectorParent | '')} data-testid="ev-filter-sector" aria-label="القاطع">
              <option value="">كل القواطع</option>{(Object.keys(SECTOR_LABEL) as SectorParent[]).map((k) => <option key={k} value={k}>{SECTOR_LABEL[k]}</option>)}
            </select>
            <select className={clsx(field, 'w-40')} value={period} onChange={(e) => setPeriod(e.target.value as PeriodType | '')} data-testid="ev-filter-period" aria-label="نوع الفعالية">
              <option value="">كل الأنواع</option>{(Object.keys(PERIOD_LABEL) as PeriodType[]).map((k) => <option key={k} value={k}>{PERIOD_LABEL[k]}</option>)}
            </select>
            <input className={clsx(field, 'w-44')} placeholder="بحث: عنوان / نوع عمل" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ev-search" />
          </div>
        </div>
        <p className="text-xs text-slate-500" data-testid="ev-count">{rows.length} فعالية</p>
        {list.isLoading && rows.length === 0 ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا توجد فعاليات مكتملة ضمن هذه الفلاتر" hint="تظهر هنا التصاميم بعد أن يكملها قسم الإعلام" /> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="ev-list">
            {rows.map((d) => <EventCard key={d.id} d={d} coverUrl={d.cover_image_path ? covers.data?.[d.cover_image_path] ?? null : null} onOpen={() => setOpenId(d.id)} />)}
          </div>
        )}
      </section>
      {openId && <ExecDesignViewer designId={openId} close={() => setOpenId(null)} />}
    </div>
  )
}

function EventCard({ d, coverUrl, onOpen }: { d: CompletedDesignRow; coverUrl: string | null; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-right shadow-sm transition hover:border-slate-400" data-testid={`ev-${d.id}`}>
      <div className="aspect-[16/9] w-full bg-slate-100">{coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-xs text-slate-400">بلا غلاف</div>}</div>
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">{PERIOD_LABEL[d.period_type]}</span>
          <span className="text-[11px] text-slate-500">{SECTOR_LABEL[d.sector_parent]}</span>
        </div>
        <h3 className="truncate text-sm font-black text-slate-800">{d.title}</h3>
        <p className="text-[11px] text-slate-500">{fmtDay(d.period_start)}{d.period_end !== d.period_start && ` → ${fmtDay(d.period_end)}`}</p>
        <p className="truncate text-[11px] text-slate-600">{d.work_types.join(' · ') || '—'}</p>
        <p className="text-[11px] text-slate-400">{d.photo_count} صورة · أكمله {d.completed_by_name ?? '—'} · {fmtDateTime(d.completed_at)}</p>
      </div>
    </button>
  )
}

/** عارض التصميم المكتمل بملء الشاشة — قراءة فقط (بلا onSaveReport) مع تصدير وطباعة */
export function ExecDesignViewer({ designId, close }: { designId: string; close: () => void }) {
  const detail = useDesignDetail(designId)
  const data = detail.data
  const coverPath = data?.design.cover_image_path ?? null
  const coverUrls = useSignedPhotoUrls(coverPath ? [coverPath] : [])
  const coverUrl = coverPath ? coverUrls.data?.[coverPath] : null
  const title = data?.design.title ?? ''
  useEffect(() => {
    if (!title) return
    const prev = document.title
    document.title = `جزيرة الأكارم — ${title}`
    return () => { document.title = prev }
  }, [title])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  const groups = useMemo(() => {
    const map = new Map<string, Array<{ id: string; rowId: string; path: string; caption: string | null; reportCaption: string | null; fit: 'contain' | 'cover'; zoom: number }>>()
    for (const p of data?.photos ?? []) {
      const arr = map.get(p.work_type) ?? []
      arr.push({ id: p.photo_id, rowId: p.photo_id, path: p.storage_path, caption: p.caption, reportCaption: p.report_caption, fit: p.display_fit, zoom: p.display_zoom })
      map.set(p.work_type, arr)
    }
    return [...map.entries()].map(([workType, photos]) => ({ workType, photos }))
  }, [data?.photos])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-100" dir="rtl" data-testid="exec-design-viewer" data-rp-overlay>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white/95 px-3 py-2 backdrop-blur sm:px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-black text-slate-800 sm:text-base">{title || 'الفعالية'}</h2>
        {data && (
          <>
            <button onClick={() => window.print()} className="flex h-10 items-center gap-1 rounded-xl bg-cyan-700 px-3 text-sm font-black text-white" data-testid="exec-design-print">طباعة</button>
            <DesignExportMenu title={title} />
          </>
        )}
        <Button variant="secondary" size="sm" onClick={close} data-testid="exec-design-close">إغلاق</Button>
      </div>
      {detail.isLoading || !data ? (
        <div className="grid h-[60vh] place-items-center"><LoadingSpinner label="جارٍ فتح الفعالية…" /></div>
      ) : (
        <div data-rp-preview className="p-2 sm:p-4">
          <DesignReportView
            title={title}
            sector={data.design.sector_parent as SectorParent}
            periodType={data.design.period_type as PeriodType}
            periodStart={data.design.period_start}
            periodEnd={data.design.period_end}
            coverUrl={coverUrl}
            sheets={Object.fromEntries((data.sheets ?? []).map((s) => [s.work_type, s.sheet_text]))}
            summary={(data.design.summary as unknown as ReportSummary | null) ?? null}
            colors={(data.design.template_colors as unknown as ReportColors | null) ?? null}
            style={(data.design.template_style as unknown as ReportStyle | null) ?? null}
            groups={groups}
          />
        </div>
      )}
    </div>
  )
}
