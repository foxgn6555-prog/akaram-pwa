/**
 * شريط المرشّحات + التصدير لوحدة الكشوفات (الجولة B)
 *  · أساسي: بحث · النوع · الحالة · الفترة (شهر أو من/إلى)
 *  · متقدم: الهدف (آلية/موظف) · القاطع/القسم · مُعدّ الكشف · المبلغ (مع/بدون/مُستقطع) · الترتيب
 *  · رقائق المرشّحات الفعّالة + مسح الكل · عدّاد النتائج ومجموع المبالغ
 *  · التصدير: Excel · CSV · طباعة تقرير (يُصدَّر ما هو مرشَّح حالياً فقط)
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { DISCLOSURE_STATUS_LABEL, type DisclosureStatusV2, type DisclosureType, type DisclosureV2 } from '@sdk/disclosures-unit.sdk'
import { EMPTY_FILTERS, filtersSummary, type AmountFilter, type SortKey, type UiFilters } from '../lib/filters'
import { useUiStore } from '@stores/ui.store'
import { disclosuresToExcel, downloadCsv, printDisclosuresReport, type ExportContext } from '../lib/export-v2'
import { btnGhost, fmtIqd, inputCls } from './ui'

const activeCount = (f: UiFilters) => filtersSummary(f).length

export interface DisclosureFiltersProps {
  value: UiFilters; onChange: (f: UiFilters) => void
  types: DisclosureType[]
  /** الصفوف قبل الترشيح المحلي (لاشتقاق القوائم) */
  rows: DisclosureV2[]
  /** الصفوف بعد الترشيح (للعدّاد والتصدير) */
  filtered: DisclosureV2[]
  statuses: DisclosureStatusV2[]
  exportCtx: Omit<ExportContext, 'filtersSummary'>
  loading?: boolean
  testId?: string
}
export function DisclosureFilters({ value: f, onChange, types, rows, filtered, statuses, exportCtx, loading, testId = 'disc-filters' }: DisclosureFiltersProps) {
  const [adv, setAdv] = useState(false)
  const [busy, setBusy] = useState<'' | 'xlsx' | 'csv' | 'print'>('')
  const addToast = useUiStore((s) => s.addToast)
  const set = (p: Partial<UiFilters>) => onChange({ ...f, ...p })
  const sectors = useMemo(() => [...new Set(rows.map((d) => d.sector ?? d.department_name ?? '—'))].sort((a, b) => a.localeCompare(b, 'ar')), [rows])
  const preparers = useMemo(() => [...new Set(rows.map((d) => d.prepared_by_name ?? '—'))].sort((a, b) => a.localeCompare(b, 'ar')), [rows])
  const total = useMemo(() => filtered.reduce((a, d) => a + (d.amount ?? 0), 0), [filtered])
  const summary = filtersSummary(f, types)
  const ctx: ExportContext = { ...exportCtx, filtersSummary: summary }
  const run = async (kind: 'xlsx' | 'csv' | 'print') => {
    if (filtered.length === 0) { addToast({ type: 'warning', message: 'لا توجد كشوفات ضمن المرشّحات الحالية للتصدير' }); return }
    setBusy(kind)
    try {
      if (kind === 'xlsx') { await disclosuresToExcel(filtered, ctx); addToast({ type: 'success', message: `صُدّر ملف Excel (${filtered.length} كشف)` }) }
      else if (kind === 'csv') downloadCsv(filtered)
      else printDisclosuresReport(filtered, ctx)
    } catch (e) { addToast({ type: 'error', message: e instanceof Error ? e.message : 'تعذّر التصدير' }) } finally { setBusy('') }
  }
  const n = activeCount(f)
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-5">
        <input className={clsx(inputCls, 'md:col-span-2')} placeholder="بحث: رقم الكشف / DB / الاسم / التفاصيل…" value={f.q} onChange={(e) => set({ q: e.target.value })} data-testid="filter-q" />
        <select className={inputCls} value={f.type} onChange={(e) => set({ type: e.target.value })} data-testid="filter-type"><option value="">كل الأنواع</option>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        {statuses.length > 1 ? <select className={inputCls} value={f.status} onChange={(e) => set({ status: e.target.value as UiFilters['status'] })} data-testid="filter-status"><option value="">كل الحالات</option>{statuses.map((s) => <option key={s} value={s}>{DISCLOSURE_STATUS_LABEL[s]}</option>)}</select> : <span className="hidden md:block" />}
        <input type="month" className={inputCls} value={f.month} disabled={!!(f.from || f.to)} onChange={(e) => set({ month: e.target.value })} data-testid="filter-month" dir="ltr" title="الشهر" />
        <button type="button" className={clsx(btnGhost, 'md:col-span-1', adv && 'border-brand-500 text-brand-700')} onClick={() => setAdv((v) => !v)} data-testid="filter-adv-toggle" aria-expanded={adv}>مرشّحات متقدمة{n ? ` (${n})` : ''}</button>
        {adv && (
          <div className="grid gap-2 md:col-span-5 md:grid-cols-6" data-testid="filter-adv">
            <label className="text-xs font-bold text-slate-600">من<input type="date" className={inputCls} value={f.from} onChange={(e) => set({ from: e.target.value, month: '' })} data-testid="filter-from" dir="ltr" /></label>
            <label className="text-xs font-bold text-slate-600">إلى<input type="date" className={inputCls} value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value, month: '' })} data-testid="filter-to" dir="ltr" /></label>
            <label className="text-xs font-bold text-slate-600">الهدف<select className={inputCls} value={f.kind} onChange={(e) => set({ kind: e.target.value as UiFilters['kind'] })} data-testid="filter-kind"><option value="">الكل</option><option value="vehicle">آليات</option><option value="employee">موظفون</option></select></label>
            <label className="text-xs font-bold text-slate-600">القاطع/القسم<select className={inputCls} value={f.sector} onChange={(e) => set({ sector: e.target.value })} data-testid="filter-sector"><option value="">الكل</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">مُعدّ الكشف<select className={inputCls} value={f.preparer} onChange={(e) => set({ preparer: e.target.value })} data-testid="filter-preparer"><option value="">الكل</option>{preparers.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">المبلغ<select className={inputCls} value={f.amount} onChange={(e) => set({ amount: e.target.value as AmountFilter })} data-testid="filter-amount"><option value="">الكل</option><option value="with">بمبلغ</option><option value="without">بدون مبلغ</option><option value="deducted">استقطاع مُسجَّل</option></select></label>
            <label className="text-xs font-bold text-slate-600">الترتيب<select className={inputCls} value={f.sort} onChange={(e) => set({ sort: e.target.value as SortKey })} data-testid="filter-sort"><option value="date_desc">الأحدث أولاً</option><option value="date_asc">الأقدم أولاً</option><option value="amount_desc">الأعلى مبلغاً</option><option value="ref_desc">رقم الكشف</option><option value="name">الاسم</option></select></label>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600" data-testid="filter-count">{loading ? 'جارٍ التحميل…' : <><b>{filtered.length}</b> كشف{filtered.length !== rows.length ? ` من ${rows.length}` : ''} · مجموع المبالغ <b>{fmtIqd(total)}</b></>}</span>
        {summary.map((s) => <span key={s} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800" data-testid="filter-chip">{s}</span>)}
        {n > 0 && <button type="button" className="text-[11px] font-bold text-rose-700 underline" onClick={() => onChange({ ...EMPTY_FILTERS })} data-testid="filter-clear">مسح المرشّحات</button>}
        <div className="ms-auto flex gap-1.5">
          <button type="button" className={clsx(btnGhost, 'h-9 px-3 text-xs')} disabled={!!busy} onClick={() => void run('xlsx')} data-testid="export-xlsx">{busy === 'xlsx' ? '…' : 'Excel'}</button>
          <button type="button" className={clsx(btnGhost, 'h-9 px-3 text-xs')} disabled={!!busy} onClick={() => void run('csv')} data-testid="export-csv">CSV</button>
          <button type="button" className={clsx(btnGhost, 'h-9 px-3 text-xs')} disabled={!!busy} onClick={() => void run('print')} data-testid="export-print">طباعة التقرير</button>
        </div>
      </div>
    </div>
  )
}
