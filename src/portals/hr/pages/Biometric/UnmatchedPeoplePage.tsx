/**
 * وحدة «الأشخاص غير المطابقين» (00175)
 * ─────────────────────────────────────
 * كل شخص بصم على جهاز ولم يُربط بموظف بعد — لا يظهر في الحضور الرسمي، فنحفظ له هنا سجلاً يومياً كاملاً
 * حتى لا تضيع بيانات أحد أثناء التطوير: لكل يوم أول/آخر بصمة، ساعات العمل (أول → آخر بصمة)،
 * والحالة: حاضر (بصمتان+) / بصمة ناقصة (واحدة) / غائب (لا شيء — كل أيام الفترة أيام عمل).
 * فلاتر: فترة (شهر أو أيام محددة) · فرع · بحث. تصدير Excel: صف لكل شخص وعمود لكل يوم.
 * تُستخدم في HR (مع رابط الربط) وفي IT للقراءة.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { useBranches } from '@features/branches'
import { UNMATCHED_STATUS_LABELS, UNMATCHED_STATUS_SHORT, useUnmatchedReport } from '@features/integrations'
import type { UnmatchedDay, UnmatchedPersonRow } from '@features/integrations'
import { buildUnmatchedWorkbook, dayCellText, fmtHours } from '@features/integrations/lib/unmatchedExcel'
import { downloadWorkbook } from '@features/hr/lib/hrExcel'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExportButton } from '../../components/ExportButton'
import { StatCard } from '../../components/hr-ui'

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const monthBounds = (ym: string): [string, string] => {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}
const CELL: Record<UnmatchedDay['status'], string> = {
  present: 'bg-emerald-50 text-emerald-800', missing: 'bg-amber-50 text-amber-800', absent: 'bg-red-50 text-red-700',
}
const field = 'h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs'

export default function UnmatchedPeoplePage({ readOnly = false, ledgerPath = '/hr/biometric' }: { readOnly?: boolean; ledgerPath?: string }) {
  const today = new Date()
  const [month, setMonth] = useState(isoDay(today).slice(0, 7))
  const [from, setFrom] = useState(monthBounds(isoDay(today).slice(0, 7))[0])
  const [to, setTo] = useState(isoDay(today))
  const [branchId, setBranchId] = useState('')
  const [search, setSearch] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const { data: branches } = useBranches()
  const { data, isLoading, error } = useUnmatchedReport({ from, to, branchId: branchId || null, search: search.trim() || null })
  const rows = useMemo(() => (data ?? []).filter((r) => !onlyIssues || r.missing_days > 0 || r.absent_days > 0), [data, onlyIssues])
  const days = rows[0]?.days ?? data?.[0]?.days ?? []
  const totals = useMemo(() => rows.reduce((a, r) => ({ p: a.p + r.present_days, m: a.m + r.missing_days, ab: a.ab + r.absent_days, min: a.min + r.total_minutes }), { p: 0, m: 0, ab: 0, min: 0 }), [rows])
  const branchLabel = branchId ? (branches?.find((b) => b.id === branchId)?.name ?? '—') : 'كل الفروع'
  const rangeTooWide = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 62

  const pickMonth = (ym: string) => {
    setMonth(ym)
    const [f, t] = monthBounds(ym)
    setFrom(f); setTo(t < isoDay(today) ? t : isoDay(today))
  }

  return (
    <section aria-labelledby="um-title" className="space-y-4" data-testid="unmatched-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="um-title" className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Icon name="fingerprint" size={20} className="text-brand-600" /> الأشخاص غير المطابقين
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            أشخاص بصموا على الأجهزة ولم يُربطوا بموظف في المنصة بعد. نحفظ حضورهم يوماً بيوم هنا حتى لا تضيع بياناتهم:
            «حاضر» = بصمتان فأكثر (ساعات العمل من أول بصمة إلى آخرها)، «بصمة ناقصة» = بصمة واحدة فقط، «غائب» = لا بصمة في ذلك اليوم.
            {!readOnly && <> اربط كل رقم بموظف من <Link to={ledgerPath} className="font-semibold text-brand-700 hover:underline">دفتر البصمة</Link> لينتقل حضوره تلقائياً إلى سجل الحضور الرسمي.</>}
          </p>
        </div>
        <ExportButton label="تصدير Excel (صف لكل شخص)" testId="unmatched-export" disabled={rows.length === 0}
          onExport={async () => downloadWorkbook(await buildUnmatchedWorkbook(rows, { from, to, branchLabel, search: search.trim() || undefined }), `غير-المطابقين-${from}_${to}.xlsx`)} />
      </header>

      {/* الفلاتر */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-6" data-testid="unmatched-filters">
        <label className="text-[11px] text-slate-600">الشهر
          <input type="month" className={clsx(field, 'mt-1 w-full')} value={month} onChange={(e) => e.target.value && pickMonth(e.target.value)} data-testid="um-month" />
        </label>
        <label className="text-[11px] text-slate-600">من يوم
          <input type="date" className={clsx(field, 'mt-1 w-full')} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="um-from" />
        </label>
        <label className="text-[11px] text-slate-600">إلى يوم
          <input type="date" className={clsx(field, 'mt-1 w-full')} value={to} onChange={(e) => setTo(e.target.value)} data-testid="um-to" />
        </label>
        <label className="text-[11px] text-slate-600">الفرع
          <select className={clsx(field, 'mt-1 w-full')} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="um-branch">
            <option value="">كل الفروع</option>
            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">بحث (اسم / PIN / جهاز)
          <input className={clsx(field, 'mt-1 w-full')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="مثال: 901" data-testid="um-search" />
        </label>
        <label className="flex items-end gap-2 pb-2 text-[11px] text-slate-600">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} data-testid="um-only-issues" /> من لديهم غياب أو نقص فقط
        </label>
      </div>

      {rangeTooWide && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">الفترة أوسع من 62 يوماً — اختر شهراً أو فترة أقصر</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard title="أشخاص غير مطابقين" value={rows.length} tone="amber" testId="um-stat-people" />
        <StatCard title="أيام حضور" value={totals.p} tone="emerald" testId="um-stat-present" />
        <StatCard title="بصمات ناقصة" value={totals.m} tone="amber" testId="um-stat-missing" />
        <StatCard title="أيام غياب" value={totals.ab} tone="red" hint={`إجمالي ساعات العمل ${fmtHours(totals.min)}`} testId="um-stat-absent" />
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">تعذر تحميل التقرير</p>}
      {!isLoading && !error && rows.length === 0 && <EmptyState title="لا أشخاص غير مطابقين في هذه الفترة" hint="كل البصمات الواصلة مرتبطة بموظفين — أو لم تصل بصمات بعد" />}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-xs" data-testid="unmatched-grid">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="sticky start-0 z-10 bg-slate-800 p-2 text-start">الاسم على الجهاز</th>
                <th className="p-2">PIN</th>
                <th className="p-2">الفرع · الجهاز</th>
                {days.map((d) => {
                  const dt = new Date(`${d.d}T00:00:00Z`)
                  return <th key={d.d} className={clsx('p-1 text-center font-bold', dt.getUTCDay() === 5 && 'bg-slate-600')} title={d.d}>{Number(d.d.slice(8, 10))}</th>
                })}
                <th className="p-2">حضور</th><th className="p-2">ناقص</th><th className="p-2">غياب</th><th className="p-2">الساعات</th>
                {!readOnly && <th className="p-2">الإجراء</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r: UnmatchedPersonRow) => (
                <tr key={`${r.device_serial}-${r.pin}`} data-testid={`um-row-${r.device_serial}-${r.pin}`}>
                  <td className="sticky start-0 z-10 bg-white p-2 font-semibold text-slate-800">{r.person_name ?? <span className="text-slate-400">— بلا اسم —</span>}</td>
                  <td className="p-2 text-center font-mono" dir="ltr">{r.pin}</td>
                  <td className="p-2 text-center text-slate-500">{r.branch_name ?? '—'} · {r.device_name}</td>
                  {r.days.map((d) => (
                    <td key={d.d} className={clsx('p-1 text-center text-[10px] font-semibold', CELL[d.status])} data-testid={`um-cell-${r.pin}-${d.d}`}
                        title={`${d.d} · ${UNMATCHED_STATUS_LABELS[d.status]}${d.first ? ` · أول ${d.first}` : ''}${d.last ? ` · آخر ${d.last}` : ''}${d.status === 'present' ? ` · ${fmtHours(d.minutes)} ساعة` : ''}`}>
                      {d.status === 'absent' ? UNMATCHED_STATUS_SHORT.absent : dayCellText(d)}
                    </td>
                  ))}
                  <td className="p-2 text-center font-bold text-emerald-700">{r.present_days}</td>
                  <td className="p-2 text-center font-bold text-amber-700">{r.missing_days}</td>
                  <td className="p-2 text-center font-bold text-red-700">{r.absent_days}</td>
                  <td className="p-2 text-center font-mono" dir="ltr">{fmtHours(r.total_minutes)}</td>
                  {!readOnly && (
                    <td className="p-2 text-center">
                      <Link to={`${ledgerPath}?pin=${encodeURIComponent(r.pin)}`} className="font-semibold text-brand-700 hover:underline" data-testid={`um-link-${r.pin}`}>ربط بموظف</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            الدليل: <span className="rounded bg-emerald-50 px-1 text-emerald-800">ح 8:30</span> حاضر وساعات العمل ·
            <span className="ms-1 rounded bg-amber-50 px-1 text-amber-800">ن 08:05</span> بصمة ناقصة ووقتها ·
            <span className="ms-1 rounded bg-red-50 px-1 text-red-700">غ</span> غائب · الأعمدة الداكنة = الجمعة
          </p>
        </div>
      )}
    </section>
  )
}
