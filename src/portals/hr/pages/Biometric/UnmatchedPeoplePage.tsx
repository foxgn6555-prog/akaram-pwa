/** تقرير غير المطابقين: الشكل الأصلي بثلاثة عروض وأرشيف، وحساب موحد لا يغير الحضور الرسمي. */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { biometric } from '@sdk/biometric.sdk'
import clsx from 'clsx'
import { useBranches } from '@features/branches'
import { UNMATCHED_STATUS_LABELS, UNMATCHED_STATUS_SHORT } from '@features/integrations'
import type { UnmatchedDay, UnmatchedPersonRow } from '@features/integrations'
import type { ArchivePersonCursor, UnmatchedUnitFilters } from '@features/integrations/types'
import { buildUnmatchedWorkbook, dayCellText, fmtHours } from '@features/integrations/lib/unmatchedExcel'
import { collectUnitRows } from '@features/integrations/lib/unmatchedUnitExcel'
import { summaryRows } from '@features/integrations/lib/unmatchedSummary'
import { downloadWorkbook } from '@features/hr/lib/hrExcel'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExportButton } from '../../components/ExportButton'
import { StatCard } from '../../components/hr-ui'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import UnmatchedArchive from './UnmatchedArchive'
import UnmatchedUnitWorkspace from './UnmatchedUnitWorkspace'
import UnmatchedLinkPerson from './UnmatchedLinkPerson'

const isoDay = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10)
const monthBounds = (ym: string): [string, string] => {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}
const CELL: Record<UnmatchedDay['status'], string> = {
  present: 'bg-emerald-50 text-emerald-800', missing: 'bg-amber-50 text-amber-800', absent: 'bg-red-50 text-red-700', leave: 'bg-blue-50 text-blue-800', review: 'bg-slate-50 text-slate-700', previous_exit: 'bg-indigo-50 text-indigo-800', pending: 'bg-slate-50 text-slate-700', future: 'bg-slate-50 text-slate-500', unknown: 'bg-slate-100 text-slate-700',
}
const field = 'h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs'

export default function UnmatchedPeoplePage({ readOnly = false }: { readOnly?: boolean; ledgerPath?: string }) {
  const [view, setView] = useState<'report' | 'grid' | 'details' | 'archive'>('report')
  const today = new Date()
  const [month, setMonth] = useState(isoDay(today).slice(0, 7))
  const [from, setFrom] = useState(monthBounds(isoDay(today).slice(0, 7))[0])
  const [to, setTo] = useState(isoDay(today))
  const [branchId, setBranchId] = useState('')
  const [search, setSearch] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [linkPerson, setLinkPerson] = useState<{ pin: string; personName: string | null; device: string } | null>(null)
  const [deviceSerial, setDeviceSerial] = useState('')
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'' | UnmatchedDay['status']>('')
  const { data: branches } = useBranches()
  const deviceQuery = useQuery({ queryKey: ['unmatched-unit-devices'], queryFn: () => biometric.unmatchedUnitDevices(), enabled: view === 'report' })
  const [exportError, setExportError] = useState('')
  const [pages, setPages] = useState<Array<ArchivePersonCursor | null>>([null])
  useEffect(() => { setPages([null]) }, [from, to, branchId, search, deviceSerial, pin, status, onlyIssues])
  const filters: UnmatchedUnitFilters = { from, to, branch: branchId || undefined, search: search.trim() || undefined,
    device: deviceSerial.trim() || undefined, pin: pin.trim() || undefined, status: status || undefined, issues: onlyIssues }
  const valid = !!from && !!to && from <= to && (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) <= 62 * 86400000
  const report = useQuery({ queryKey: ['unmatched-unit-report', 'summary', filters, pages[pages.length - 1]],
    queryFn: () => biometric.unmatchedUnitReport(filters, pages[pages.length - 1] ?? null, 26), enabled: view === 'report' && valid })
  const data = report.data
  const isLoading = report.isLoading && valid
  const error = report.error
  const rows = useMemo(() => summaryRows((data ?? []).slice(0, 25), branches ?? []), [data, branches])
  const days = rows[0]?.days ?? []
  const totals = useMemo(() => rows.reduce((a, r) => ({ p: a.p + r.present_days, m: a.m + r.missing_days, ab: a.ab + r.absent_days, min: a.min + r.total_minutes }), { p: 0, m: 0, ab: 0, min: 0 }), [rows])
  const branchLabel = branchId ? (branches?.find((b) => b.id === branchId)?.name ?? '—') : 'كل الفروع'
  const deviceLabel = deviceSerial ? (deviceQuery.data?.find(d => d.device_serial === deviceSerial)?.device_name ?? deviceSerial) : ''
  const rangeTooWide = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 62

  const pickMonth = (ym: string) => {
    setMonth(ym)
    const [f, t] = monthBounds(ym)
    setFrom(f); setTo(t < isoDay(today) ? t : isoDay(today))
  }

  return (
    <section aria-label="الأشخاص غير المطابقين" className="space-y-4" data-testid="unmatched-page">
      <ExecPageHeader icon="alert-triangle" title="الأشخاص غير المطابقين" subtitle="أرشيف مستقل لحضور غير المطابقين، بما فيهم من رُبطوا لاحقاً."
        actions={view === 'report' ? <ExportButton label="تصدير Excel (صف لكل شخص)" testId="unmatched-export" disabled={rows.length === 0 || !valid || report.isError}
          onExport={async () => { setExportError(''); try { await downloadWorkbook(await buildUnmatchedWorkbook(summaryRows(await collectUnitRows(filters), branches ?? []), { from, to, branchLabel, search: search.trim() || undefined, deviceLabel: deviceSerial ? `${deviceLabel} (${deviceSerial})` : undefined, pin: pin.trim() || undefined, status: status || undefined, onlyIssues }), `غير-المطابقين-${from}_${to}.xlsx`) } catch (e) { setExportError(e instanceof Error ? e.message : 'تعذر تصدير التقرير.') } }} /> : undefined} />
      <nav className="flex flex-wrap gap-2" aria-label="أقسام غير المطابقين">
        <button type="button" onClick={() => setView('report')} aria-pressed={view === 'report'} className={clsx('rounded-xl border px-4 py-2 text-sm font-bold', view === 'report' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700')}>التقرير الحالي</button>
        <button type="button" onClick={() => setView('grid')} aria-pressed={view === 'grid'} className={clsx('rounded-xl border px-4 py-2 text-sm font-bold', view === 'grid' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700')}>الدخول والخروج</button>
        <button type="button" onClick={() => setView('details')} aria-pressed={view === 'details'} className={clsx('rounded-xl border px-4 py-2 text-sm font-bold', view === 'details' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700')}>التفاصيل اليومية</button>
        <button type="button" onClick={() => setView('archive')} aria-pressed={view === 'archive'} className={clsx('rounded-xl border px-4 py-2 text-sm font-bold', view === 'archive' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700')}>الأرشيف</button>
      </nav>
      {view === 'archive' ? <UnmatchedArchive branches={branches ?? []} /> : view === 'grid' || view === 'details' ? <UnmatchedUnitWorkspace mode={view} branches={branches ?? []} /> : <>
      {linkPerson && !readOnly && <UnmatchedLinkPerson key={JSON.stringify([linkPerson.device, linkPerson.pin])} {...linkPerson} onClose={() => setLinkPerson(null)} />}
      <p className="text-xs text-slate-500">عند عرض وقتين فقط، هما أول وآخر بصمة ولا يُحتسبان حضوراً أو ساعات.</p>

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
        <label className="text-[11px] text-slate-600">الجهاز
          <select className={clsx(field, 'mt-1 w-full')} value={deviceSerial} onChange={(e) => setDeviceSerial(e.target.value)} data-testid="um-device"><option value="">كل الأجهزة</option>{deviceSerial && !deviceQuery.data?.some(d => d.device_serial === deviceSerial) && <option value={deviceSerial}>{deviceSerial}</option>}{deviceQuery.data?.map(d => <option key={d.device_serial} value={d.device_serial}>{d.device_name} · {d.device_serial}</option>)}</select>
        </label>
        <label className="text-[11px] text-slate-600">رقم البصمة PIN
          <input className={clsx(field, 'mt-1 w-full')} value={pin} onChange={(e) => setPin(e.target.value)} dir="ltr" data-testid="um-pin" />
        </label>
        <label className="text-[11px] text-slate-600">الحالة خلال الفترة
          <select className={clsx(field, 'mt-1 w-full')} value={status} onChange={(e) => setStatus(e.target.value as '' | UnmatchedDay['status'])} data-testid="um-status">
            <option value="">كل الحالات</option>
            {(['present', 'missing', 'absent', 'leave'] as UnmatchedDay['status'][]).map(s => <option key={s} value={s}>{UNMATCHED_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-[11px] text-slate-600">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} data-testid="um-only-issues" /> من لديهم غياب أو نقص فقط
        </label>
      </div>

      {status && <p className="text-xs text-slate-500">يظهر الأشخاص الذين لديهم هذه الحالة في يوم واحد على الأقل، مع جميع أيام الفترة ومجاميعها.</p>}
      {deviceQuery.isError && <p role="alert" className="text-sm text-red-700">تعذر تحميل قائمة الأجهزة.</p>}
      {exportError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{exportError}</p>}
      {!valid && !rangeTooWide && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">اختر فترة صحيحة.</p>}
      {rangeTooWide && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">الفترة أوسع من 63 يوماً — اختر شهراً أو فترة أقصر</p>}

      <p className="text-xs text-slate-500">المجاميع أدناه تخص الصفحة المعروضة فقط؛ التصدير يشمل كل النتائج حسب الفلاتر.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard title="أشخاص غير مطابقين" value={rows.length} tone="amber" testId="um-stat-people" />
        <StatCard title="أيام حضور" value={totals.p} tone="emerald" testId="um-stat-present" />
        <StatCard title="بصمات ناقصة" value={totals.m} tone="amber" testId="um-stat-missing" />
        <StatCard title="أيام غياب" value={totals.ab} tone="red" hint={`إجمالي ساعات العمل ${fmtHours(totals.min)}`} testId="um-stat-absent" />
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">تعذر تحميل التقرير</p>}
      {valid && !isLoading && !error && rows.length === 0 && <EmptyState title="لا أشخاص غير مطابقين في هذه الفترة" hint="جرّب تعديل الفترة أو الفلاتر، أو تأكد من وصول البصمات." />}

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r: UnmatchedPersonRow) => (
                <tr key={JSON.stringify([r.device_serial, r.pin])} data-testid={`um-row-${r.device_serial}-${r.pin}`}>
                  <td className="sticky start-0 z-10 min-w-36 bg-white p-2 font-semibold text-slate-800"><div>{r.person_name ?? <span className="text-slate-400">— بلا اسم —</span>}</div>{!readOnly && <button type="button" className="mt-1 whitespace-nowrap text-[11px] font-bold text-brand-700 underline" onClick={() => setLinkPerson({ pin: r.pin, personName: r.person_name, device: r.device_serial })} data-testid={`um-link-${r.pin}`}>ربط بموظف</button>}</td>
                  <td className="p-2 text-center font-mono" dir="ltr">{r.pin}</td>
                  <td className="p-2 text-center text-slate-500">{r.branch_name ?? '—'} · {r.device_name}<span className="block font-mono text-[10px]" dir="ltr">{r.device_serial}</span></td>
                  {r.days.map((d) => (
                    <td key={d.d} className={clsx('whitespace-pre-line p-1 text-center text-[10px] font-semibold', CELL[d.status])} data-testid={`um-cell-${r.pin}-${d.d}`}
                        title={`${d.d} · ${d.status === 'review' ? 'أول وآخر بصمة، دون احتساب حضور أو ساعات' : UNMATCHED_STATUS_LABELS[d.status]}${d.first ? ` · أول ${d.first}` : ''}${d.last ? ` · آخر ${d.last}` : ''}${d.status === 'present' ? ` · ${fmtHours(d.minutes)} ساعة` : ''}`}>
                      {d.status === 'absent' ? UNMATCHED_STATUS_SHORT.absent : dayCellText(d)}
                    </td>
                  ))}
                  <td className="p-2 text-center font-bold text-emerald-700">{r.present_days}</td>
                  <td className="p-2 text-center font-bold text-amber-700">{r.missing_days}</td>
                  <td className="p-2 text-center font-bold text-red-700">{r.absent_days}</td>
                  <td className="p-2 text-center font-mono" dir="ltr">{fmtHours(r.total_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            الدليل: <span className="rounded bg-emerald-50 px-1 text-emerald-800">ح 8:30</span> حاضر وساعات العمل ·
            <span className="ms-1 rounded bg-amber-50 px-1 text-amber-800">ن 08:05</span> بصمة ناقصة ووقتها ·
            <span className="ms-1 rounded bg-red-50 px-1 text-red-700">غ</span> غائب · إ = مجاز · الأعمدة الداكنة = الجمعة
          </p>
        </div>
      )}
      <div className="flex items-center gap-2"><button type="button" disabled={pages.length === 1 || report.isFetching} className={field} onClick={() => setPages(p => p.slice(0, -1))}>السابق</button><button type="button" disabled={!data || data.length <= 25 || report.isFetching} className={field} onClick={() => { const r = data?.[24]; if (r) setPages(p => [...p, { device: r.device_serial, pin: r.pin }]) }}>التالي</button><span className="text-xs text-slate-500">الصفحة {pages.length}</span></div>
      </>}
    </section>
  )
}
