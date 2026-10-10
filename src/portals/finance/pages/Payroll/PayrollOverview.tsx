/**
 * بوابة الشؤون المالية — وحدة «الرواتب»
 * ① كشف الشهر المستلم من غرفة العمليات (أيام/تأخير/استقطاعات) + الصافي المقترح، تعديل صف بسبب، اعتماد يقفل الشهر، تصدير Excel.
 * ② ملفات الرواتب (المالية فقط): نوع التعاقد، الأساسي/أجر اليوم، المخصصات، الاستقطاعات الثابتة.
 * ③ إشعارات الموارد البشرية: رواتب بانتظار التعريف + تسويات نهاية الخدمة.
 */
import { Fragment, useMemo, useState } from 'react'
import { ATTENDANCE_STATUS_LABELS, CONTRACT_LABELS, TERMINATION_LABELS, useAdjustPayroll, useApprovePayroll, useEmployeeMonthDays, useEmployeeMonthDeductions, useFinanceNotices, useMarkNoticeDone, useMonthExportStatus, usePayrollReconcile, usePayrollSheet } from '@features/hr'
import type { PayrollReconcileRow, PayrollSheetRow, TerminationType } from '@features/hr'
import { downloadPayrollExcel, rowDeductions, rowGross } from '@features/hr/lib/payrollExcel'
import { applyFilters, branchOptions, DEFAULT_FILTERS, departmentOptions, explainRow, groupByBranchDept, RECONCILE_ISSUE_LABELS, reconcileSummary, sheetTotals, SORT_LABELS, sortRows, totalsConsistent } from '@features/hr/lib/payrollSheetModel'
import type { ProfileFilter, SheetFilters, SortKey } from '@features/hr/lib/payrollSheetModel'
import { hr as hrSdk } from '@sdk/hr.sdk'
import { ProfilesTab } from './SalaryProfiles'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { Field, MonthPicker, StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMinutes, fmtMoney, fmtTime, monthStart } from '@portals/hr/components/hr-format'
import { STATUS_STYLES } from '@portals/hr/components/hr-format'

type Tab = 'sheet' | 'profiles' | 'notices'

export default function PayrollOverview() {
  const [tab, setTab] = useState<Tab>('sheet')
  const { data: notices = [] } = useFinanceNotices()
  return (
    <div className="space-y-4" data-testid="finance-payroll">
      <header><h1 className="text-xl font-black">الرواتب</h1><p className="text-xs text-slate-500">بيانات الراتب تُدخل وتُعدَّل هنا حصراً — لا تظهر لأي بوابة أخرى</p></header>
      <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
        {([['sheet', 'كشف الشهر'], ['profiles', 'ملفات الرواتب'], ['notices', `إشعارات الموارد البشرية${notices.length ? ` (${notices.length})` : ''}`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={clsx('rounded-lg px-3 py-1.5', tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} data-testid={`ftab-${k}`}>{l}</button>
        ))}
      </nav>
      {tab === 'sheet' && <SheetTab onDefine={() => setTab('profiles')} />}
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'notices' && <NoticesTab onDefine={() => setTab('profiles')} />}
    </div>
  )
}

// ── 00198 · شريط رحلة الكشف: غرفة العمليات → التصدير → التحقق الحسابي → اعتماد المالية ──
function PipelineStrip({ head, approved, stale, rc, hasReconcile, blockReason }: { head: PayrollSheetRow; approved: boolean; stale: boolean; rc: ReturnType<typeof reconcileSummary>; hasReconcile: boolean; blockReason: string }) {
  const exportedAt = new Date(head.exported_at).toLocaleString('ar-IQ-u-nu-latn')
  const steps: { key: string; label: string; hint: string; state: 'done' | 'warn' | 'bad' | 'active' | 'todo' }[] = [
    { key: 'ops', label: 'اعتماد غرفة العمليات', hint: 'حضورية الشهر مُدقَّقة ومعتمدة', state: 'done' },
    { key: 'export', label: `التصدير v${head.export_version}`, hint: stale ? 'تغيّرت الحضورية بعده — يلزم إعادة تصدير' : `مُستلم ${exportedAt}`, state: stale ? 'warn' : 'done' },
    { key: 'verify', label: 'التحقق الحسابي', hint: !hasReconcile ? 'جارٍ…' : rc.money > 0 ? `${rc.money} صف غير متطابق` : `${rc.total} صف متطابق`, state: !hasReconcile ? 'todo' : rc.money > 0 ? 'bad' : 'done' },
    { key: 'approve', label: 'اعتماد المالية', hint: approved ? 'معتمد ومقفل' : blockReason ? 'موقوف — راجع الجاهزية' : 'بانتظار الاعتماد', state: approved ? 'done' : blockReason ? 'bad' : 'active' },
  ]
  const cls = { done: 'bg-emerald-50 text-emerald-900 ring-emerald-200', warn: 'bg-amber-50 text-amber-900 ring-amber-200', bad: 'bg-red-50 text-red-900 ring-red-200', active: 'bg-brand-600 text-white ring-brand-600', todo: 'bg-slate-50 text-slate-500 ring-slate-200' }
  const dot = { done: 'bg-emerald-600 text-white', warn: 'bg-amber-500 text-white', bad: 'bg-red-600 text-white', active: 'bg-white/25 text-white', todo: 'bg-slate-200 text-slate-600' }
  const mark = { done: '✓', warn: '!', bad: '✗', active: '…', todo: '' }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="ps-pipeline">
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.key} className={clsx('flex items-center gap-2 rounded-xl px-2.5 py-2 ring-1', cls[s.state])} data-testid={`ps-step-${s.key}`} data-state={s.state}>
            <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black', dot[s.state])}>{mark[s.state] || i + 1}</span>
            <span className="min-w-0"><span className="block truncate text-[11px] font-black">{s.label}</span><span className={clsx('block truncate text-[10px]', s.state === 'active' ? 'text-white/80' : 'opacity-80')}>{s.hint}</span></span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-slate-500" data-testid="ps-meta">الإصدار v{head.export_version} · مُستلم من غرفة العمليات {exportedAt} · {approved ? <span className="font-bold text-emerald-700">معتمد ومقفل</span> : <span className="font-bold text-sky-700">بانتظار الاعتماد — قد تعيد غرفة العمليات التصدير</span>}{hasReconcile && <> · <span className={clsx('font-bold', rc.money === 0 ? 'text-emerald-700' : 'text-red-700')} data-testid="ps-consistency">{rc.money === 0 ? `✓ التحقق الحسابي: ${rc.total} صف متطابق` : `✗ ${rc.money} صف غير متطابق`}</span></>}</p>
    </section>
  )
}

// ── كشف الشهر ──
const FILTER_SELECT = 'rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs'
function SheetTab({ onDefine }: { onDefine: () => void }) {
  const [month, setMonth] = useState(monthStart())
  const [filters, setFilters] = useState<SheetFilters>(DEFAULT_FILTERS)
  const [view, setView] = useState<'sheet' | 'verify'>('sheet')
  const { data: rows = [], isLoading } = usePayrollSheet(month)
  const { data: exportStatus } = useMonthExportStatus(month)
  const { data: reconcile = [], isLoading: reconcileLoading } = usePayrollReconcile(month, rows.length > 0)
  const approve = useApprovePayroll()
  const [editing, setEditing] = useState<PayrollSheetRow | null>(null)
  const [details, setDetails] = useState<PayrollSheetRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const setF = <K extends keyof SheetFilters>(k: K, v: SheetFilters[K]) => setFilters((f) => (k === 'branch' ? { ...f, branch: v as string, department: '' } : { ...f, [k]: v }))
  const branches = useMemo(() => branchOptions(rows), [rows])
  const departments = useMemo(() => departmentOptions(rows, filters.branch), [rows, filters.branch])
  const shown = useMemo(() => sortRows(applyFilters(rows, filters), filters.sort, filters.dir), [rows, filters])
  /** 00199 — الجدول الرئيسي للمُسعَّرين فقط؛ من بلا ملف راتب يظهرون في بطاقة مستقلة (إلا إن رُشِّح «بلا ملف راتب» صراحةً) */
  const tableRows = useMemo(() => (filters.profile === 'missing' ? shown : shown.filter((r) => r.pay_type != null)), [shown, filters.profile])
  const groups = useMemo(() => groupByBranchDept(tableRows), [tableRows])
  const tableTotals = useMemo(() => sheetTotals(tableRows), [tableRows])
  const multiBranch = groups.length > 1
  const head = rows[0]
  const approved = head?.export_status === 'approved'
  const totalsAll = useMemo(() => sheetTotals(rows), [rows])
  const totals = useMemo(() => sheetTotals(shown), [shown])
  const filtered = shown.length !== rows.length
  const missingRows = useMemo(() => rows.filter((r) => r.pay_type == null), [rows])
  const missing = missingRows.length
  const unevaluated = totalsAll.unevaluated
  const rc = useMemo(() => reconcileSummary(reconcile), [reconcile])
  const consistent = totalsConsistent(totalsAll, rows.length)
  const activeFilters = (filters.branch ? 1 : 0) + (filters.department ? 1 : 0) + (filters.contract ? 1 : 0) + (filters.profile !== 'all' ? 1 : 0) + (filters.search ? 1 : 0)
  const filtersLabel = [filters.branch && `الفرع: ${filters.branch}`, filters.department && `القسم: ${filters.department}`, filters.contract && `التعاقد: ${CONTRACT_LABELS[filters.contract]}`, filters.profile !== 'all' && `الحالة: ${PROFILE_LABELS[filters.profile]}`, filters.search && `بحث: ${filters.search}`, filters.sort !== 'default' && `ترتيب: ${SORT_LABELS[filters.sort]} ${filters.dir === 'desc' ? '↓' : '↑'}`].filter(Boolean).join(' · ')
  const blockReason = !head ? 'لا كشف' : approved ? '' : missing > 0 ? `${missing} موظفاً بلا ملف راتب — لا يمكن الاعتماد قبل تعريف رواتبهم (أو إنهاء خدمتهم)` : !rc.canApprove ? `${rc.money} صف غير متطابق حسابياً — راجع «التحقق الحسابي»` : !consistent ? 'مجاميع الكشف غير متسقة (الإجمالي − الاستقطاعات ≠ الصافي)' : ''

  const doApprove = async () => {
    if (!head || blockReason) return
    const stale = !!exportStatus?.needs_reexport
    if (stale && !window.confirm(`تنبيه: حدثت ${exportStatus?.changes_after ?? 0} تغييرات في الحضورية بعد هذا التصدير${(exportStatus?.disclosure_deductions_after ?? 0) > 0 ? ` (منها ${exportStatus?.disclosure_deductions_after} استقطاعات كشوفات معتمدة)` : ''} وهي غير مشمولة في هذا الكشف.\nالأفضل الطلب من غرفة العمليات إعادة التصدير. هل تريد الاعتماد رغم ذلك؟`)) return
    if (unevaluated > 0 && !window.confirm(`الكشف يحتوي ${unevaluated} يوم عمل غير محتسب — الصافي فيه أعلى من الصحيح. اعتماد رغم ذلك؟`)) return
    if (!window.confirm(`اعتماد الكشف يقفل الشهر نهائياً ولا يمكن لغرفة العمليات إعادة تصديره.\n${totalsAll.count} موظفاً · إجمالي الصافي المعتمد ${fmtMoney(totalsAll.final)} د.ع.\nتأكيد الاعتماد؟`)) return
    try { await approve.mutateAsync({ exportId: head.export_id, force: stale }) } catch { /* toast in hook */ }
  }
  const doExport = async () => {
    setExporting(true)
    try {
      const deductions = await hrSdk.listDeductions(month).catch(() => [])
      const shownIds = new Set(shown.map((r) => r.employee_id))
      await downloadPayrollExcel(month, shown, filtered ? deductions.filter((d) => shownIds.has(d.employee_id)) : deductions, { filtersLabel: filtered || filters.sort !== 'default' ? filtersLabel : undefined, reconcile: filtered ? reconcile.filter((r) => shownIds.has(r.employee_id)) : reconcile })
    } finally { setExporting(false) }
  }
  const toggleSort = (k: SortKey) => setFilters((f) => (f.sort === k ? { ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' } : { ...f, sort: k, dir: k === 'name' || k === 'number' || k === 'department' || k === 'default' ? 'asc' : 'desc' }))
  const Th = ({ k, label, title, className }: { k?: SortKey; label: string; title?: string; className?: string }) => (
    <th className={clsx('p-2', className)} title={title} aria-sort={k && filters.sort === k ? (filters.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {k ? <button type="button" className={clsx('inline-flex items-center gap-0.5 whitespace-nowrap', filters.sort === k && 'text-brand-700')} onClick={() => toggleSort(k)} data-testid={`ps-sort-${k}`}>{label}{filters.sort === k && <span aria-hidden>{filters.dir === 'asc' ? '▲' : '▼'}</span>}</button> : label}
    </th>
  )

  return (
    <div className="space-y-3" data-testid="sheet-tab">
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
            <button type="button" className={clsx('rounded-lg px-3 py-1', view === 'sheet' ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} onClick={() => setView('sheet')} data-testid="ps-view-sheet">الكشف</button>
            <button type="button" className={clsx('rounded-lg px-3 py-1', view === 'verify' ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} onClick={() => setView('verify')} data-testid="ps-view-verify">
              التحقق الحسابي {reconcile.length > 0 && <span className={clsx('ms-1 rounded-full px-1.5 text-[10px]', rc.money > 0 ? 'bg-red-100 text-red-700' : rc.attendance > 0 || rc.missing > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700')} data-testid="ps-verify-badge">{rc.money > 0 ? `✗ ${rc.money}` : rc.attendance + rc.missing > 0 ? `⚠ ${rc.attendance + rc.missing}` : '✓'}</span>}
            </button>
          </div>
          <div className="ms-auto flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void doExport()} isLoading={exporting} disabled={shown.length === 0} data-testid="ps-excel">تصدير Excel{filtered ? ` (${shown.length})` : ''}</Button>
            <Button size="sm" onClick={() => void doApprove()} isLoading={approve.isPending} disabled={!head || approved || !!blockReason} title={blockReason || undefined} data-testid="ps-approve">{approved ? '✓ معتمد ومقفل' : 'اعتماد الكشف وقفل الشهر'}</Button>
          </div>
        </div>
        {head && (
          <div className="flex flex-wrap items-end gap-2" data-testid="ps-filters">
            <label className="text-[11px] font-semibold text-slate-600">الفرع<select className={clsx(FILTER_SELECT, 'block min-w-[9rem]')} value={filters.branch} onChange={(e) => setF('branch', e.target.value)} data-testid="ps-f-branch"><option value="">كل الفروع ({branches.length})</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
            <label className="text-[11px] font-semibold text-slate-600">القسم{filters.branch ? ` (أقسام ${filters.branch})` : ''}<select className={clsx(FILTER_SELECT, 'block min-w-[9rem]')} value={filters.department} onChange={(e) => setF('department', e.target.value)} data-testid="ps-f-dept"><option value="">كل الأقسام ({departments.length})</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
            <label className="text-[11px] font-semibold text-slate-600">التعاقد<select className={clsx(FILTER_SELECT, 'block')} value={filters.contract} onChange={(e) => setF('contract', e.target.value as SheetFilters['contract'])} data-testid="ps-f-contract"><option value="">الكل</option><option value="monthly">شهري</option><option value="daily">أجر يومي</option></select></label>
            <label className="text-[11px] font-semibold text-slate-600">الحالة<select className={clsx(FILTER_SELECT, 'block')} value={filters.profile} onChange={(e) => setF('profile', e.target.value as ProfileFilter)} data-testid="ps-f-profile">{(Object.keys(PROFILE_LABELS) as ProfileFilter[]).map((k) => <option key={k} value={k}>{PROFILE_LABELS[k]}</option>)}</select></label>
            <label className="text-[11px] font-semibold text-slate-600">الترتيب<span className="flex gap-1"><select className={clsx(FILTER_SELECT, 'block')} value={filters.sort} onChange={(e) => setF('sort', e.target.value as SortKey)} data-testid="ps-f-sort">{(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}</select><button type="button" className={clsx(FILTER_SELECT, 'font-bold')} onClick={() => setF('dir', filters.dir === 'asc' ? 'desc' : 'asc')} title={filters.dir === 'asc' ? 'تصاعدي' : 'تنازلي'} data-testid="ps-f-dir">{filters.dir === 'asc' ? '▲' : '▼'}</button></span></label>
            <input className={clsx(field, 'max-w-xs')} placeholder="بحث: اسم / رقم / قسم / فرع / عنوان" value={filters.search} onChange={(e) => setF('search', e.target.value)} data-testid="ps-search" />
            {activeFilters > 0 && <button type="button" className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700" onClick={() => setFilters(DEFAULT_FILTERS)} data-testid="ps-f-reset">إعادة الضبط ({activeFilters})</button>}
            <span className="ms-auto text-[11px] text-slate-500" data-testid="ps-shown">{filtered ? `يُعرض ${shown.length} من ${rows.length}` : `${rows.length} موظفاً`}</span>
          </div>
        )}
      </div>
      {head && (
        <PipelineStrip head={head} approved={approved} stale={!!exportStatus?.needs_reexport} rc={rc} hasReconcile={reconcile.length > 0} blockReason={blockReason} />
      )}
      {head && (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="ps-stats" data-scope={filtered ? 'filtered' : 'all'}>
          <header className="flex items-center justify-between gap-2"><h2 className="text-xs font-black text-slate-700">{filtered ? `ملخص الكشف (حسب الفلتر · ${shown.length} من ${rows.length})` : `ملخص كشف ${month.slice(0, 7)}`}</h2><span className="text-[11px] text-slate-500">الصافي = الإجمالي المستحق − إجمالي الاستقطاعات</span></header>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <StatCard title={filtered ? 'الموظفون (حسب الفلتر)' : 'الموظفون في الكشف'} value={totals.count} hint={filtered ? `من أصل ${rows.length}` : undefined} testId="ps-count" />
            <StatCard title="الإجمالي المستحق" value={fmtMoney(totals.gross)} tone="slate" hint="الأساسي + المخصصات (اليومي: الأيام المدفوعة × أجر اليوم)" testId="ps-gross" />
            <StatCard title="إجمالي الاستقطاعات" value={fmtMoney(totals.deductions)} tone="red" hint={`ثابتة ${fmtMoney(totals.fixed)} · عمليات ${fmtMoney(totals.ops)} · تلقائي ${fmtMoney(totals.auto)} · سلف ${fmtMoney(totals.advance)}`} testId="ps-deductions" />
            <StatCard title="الصافي المقترح" value={fmtMoney(totals.proposed)} tone="sky" hint={`= ${fmtMoney(totals.gross)} − ${fmtMoney(totals.deductions)}`} testId="ps-proposed" />
            <StatCard title="الصافي المعتمد" value={fmtMoney(totals.final)} tone="emerald" hint={totals.adjusted ? `${totals.adjusted} صف معدَّل يدوياً` : 'مطابق للمقترح'} testId="ps-final" />
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]" data-testid="ps-stats-secondary">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-900 ring-1 ring-amber-200" data-testid="ps-ops">استقطاعات غرفة العمليات <b className="tabular-nums">{fmtMoney(totals.ops)}</b></span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-bold text-rose-900 ring-1 ring-rose-200" data-testid="ps-auto" title="محسوب من الشرائح بعد تدقيق غرفة العمليات">استقطاع تلقائي (نقص/غياب) <b className="tabular-nums">{fmtMoney(totals.auto)}</b></span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-900 ring-1 ring-amber-200">أقساط السلف <b className="tabular-nums">{fmtMoney(totals.advance)}</b></span>
            <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold ring-1', totals.missing ? 'bg-red-50 text-red-900 ring-red-300' : 'bg-slate-50 text-slate-600 ring-slate-200')} data-testid="ps-missing" title={totals.missing ? 'عرّف رواتبهم من تبويب ملفات الرواتب' : ''}>بلا ملف راتب <b className="tabular-nums">{totals.missing}</b></span>
          </div>
        </section>
      )}
      {head && !approved && (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="ps-readiness">
          <header className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-black text-slate-700">جاهزية الاعتماد</h2>
            <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', blockReason ? 'bg-red-100 text-red-800' : exportStatus?.needs_reexport || unevaluated > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800')} data-testid="ps-readiness-state">
              {blockReason ? 'الاعتماد موقوف' : exportStatus?.needs_reexport || unevaluated > 0 ? 'يمكن الاعتماد مع تحذير' : '✓ جاهز للاعتماد'}
            </span>
          </header>
          {missing > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900" role="status" data-testid="ps-missing-banner">
              <span className="min-w-0 flex-1"><b>الاعتماد موقوف:</b> {missing} موظفاً بلا ملف راتب — <span className="font-semibold">{missingRows.slice(0, 6).map((r) => `${r.full_name} (${r.employee_number})`).join('، ')}{missing > 6 ? ` و${missing - 6} آخرين` : ''}</span>. عرّف رواتبهم من تبويب «ملفات الرواتب» ثم اطلب من غرفة العمليات إعادة التصدير.</span>
              <button type="button" className="rounded-lg bg-white px-2 py-0.5 font-bold text-red-800 ring-1 ring-red-300" onClick={() => setF('profile', 'missing')} data-testid="ps-missing-filter">عرضهم فقط</button>
            </div>
          )}
          {rc.money > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900" role="alert" data-testid="ps-reconcile-banner">
              <span className="min-w-0 flex-1"><b>خلل حسابي:</b> {rc.money} صف في الكشف أرقامه لا تطابق مكوّناته — الاعتماد ممنوع. راجع «التحقق الحسابي» لمعرفة الصفوف، واطلب إعادة التصدير من غرفة العمليات، وأبلغ التطوير المركزية إن تكرر.</span>
              <button type="button" className="rounded-lg bg-white px-2 py-0.5 font-bold text-red-800 ring-1 ring-red-300" onClick={() => setView('verify')}>فتح التحقق الحسابي</button>
            </div>
          )}
          {unevaluated > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900" role="status" data-testid="ps-unevaluated-banner">
              <b>تحذير:</b> هذا الكشف يحتوي {unevaluated} يوم عمل غير محتسب (أيام بلا بصمة لم يُسجَّل غيابها) — الصافي فيه أعلى من الصحيح. اطلب من غرفة العمليات «إعادة تصدير بيانات الشهر» (التصدير يحتسب الشهر كاملاً تلقائياً).
            </div>
          )}
          {exportStatus?.needs_reexport && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status" data-testid="ps-stale-banner">
              <b>هذا الكشف قديم:</b> حدثت {exportStatus.changes_after} تغييرات في الحضورية بعد تصديره{exportStatus.deductions_after > 0 ? ` منها ${exportStatus.deductions_after} استقطاعات` : ''}{exportStatus.disclosure_deductions_after > 0 ? ` (${exportStatus.disclosure_deductions_after} من كشوفات معتمدة)` : ''} — اطلب من غرفة العمليات «إعادة تصدير بيانات الشهر» قبل الاعتماد.
            </div>
          )}
          {!blockReason && !exportStatus?.needs_reexport && unevaluated === 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="ps-ready-line">
              ✓ كل الموظفين لهم ملف راتب · التحقق الحسابي متطابق · لا تغييرات في الحضورية بعد التصدير — يمكنك «اعتماد الكشف وقفل الشهر».
            </div>
          )}
        </section>
      )}

      {head && !approved && missing > 0 && filters.profile !== 'missing' && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3" data-testid="ps-missing-card">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-black text-amber-900">موظفون بلا ملف راتب <span className="rounded-full bg-white px-2 py-0.5 text-[11px] tabular-nums ring-1 ring-amber-200">{missing}</span></h2>
            <p className="text-[11px] text-amber-800">خارج جدول الكشف حتى يُعرَّف راتبهم — لا تدخل أيامهم في المجاميع.</p>
            <Button size="sm" onClick={onDefine} data-testid="ps-missing-define">تعريف الرواتب</Button>
          </header>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {missingRows.map((r) => (
              <li key={r.row_id} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-[11px] ring-1 ring-amber-200" data-testid={`ps-missing-row-${r.employee_number}`}>
                <b>{r.full_name}</b><span className="text-slate-500">{r.employee_number}</span>{r.department_name && <span className="text-slate-400">· {r.department_name}</span>}{r.days_absent > 0 && <span className="text-red-700" title="أيام غياب مسجّلة لدى غرفة العمليات">· غائب {r.days_absent}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'verify' ? <VerifyPanel rows={reconcile} loading={reconcileLoading} filteredIds={filtered ? new Set(shown.map((r) => r.employee_id)) : null} /> : isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لم تُصدّر غرفة العمليات بيانات هذا الشهر بعد" hint="يظهر الكشف هنا فور الضغط على «تصدير بيانات الشهر» في وحدة الحضوريات" /> : shown.length === 0 ? <EmptyState title="لا صفوف تطابق الفلاتر" hint="غيّر الفرع/القسم أو أعد ضبط الفلاتر" /> : tableRows.length === 0 ? <EmptyState title="كل الموظفين في هذا النطاق بلا ملف راتب" hint="عرّف رواتبهم من تبويب «ملفات الرواتب» ثم اطلب إعادة التصدير" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-xs" data-testid="ps-table" data-layout="net-first">
            <thead className="bg-slate-50 text-[11px] text-slate-600">
              <tr className="border-b border-slate-200">
                <Th k="name" label="الموظف" className="text-start" />
                <Th label="التعاقد" className="text-center" />
                <Th k="present" label="الأيام" title="حاضر (+ إجازة مدفوعة) / المجدولة / أيام الشهر" className="text-center" />
                <Th k="absent" label="غائب" className="text-center" />
                <Th k="gross" label="الإجمالي المستحق" title="الأساسي (أو اليومي × الأيام المدفوعة) + المخصصات" className="text-end" />
                <Th k="deductions" label="الاستقطاعات" title="ثابتة + غرفة العمليات + تلقائي + قسط السلفة — التفصيل في «التفاصيل»" className="text-end" />
                <Th label="الصافي المقترح" className="text-end" />
                <Th k="net" label="الصافي المعتمد" className="text-end" />
                <Th label="" className="w-px" />
              </tr>
            </thead>
            <tbody>
              {groups.map((b) => (
                <Fragment key={b.branch}>
                  {multiBranch && (
                    <tr className="border-t-2 border-sky-200 bg-sky-50" data-testid={`ps-branch-${b.branch}`}>
                      <td className="px-3 py-2 text-xs font-black text-sky-900" colSpan={4}>{b.branch} <span className="font-normal text-sky-700">· {b.rows.length} موظفاً · {b.departments.length} قسماً</span></td>
                      <td className="px-3 py-2 text-end font-bold tabular-nums text-sky-900">{fmtMoney(b.totals.gross)}</td>
                      <td className="px-3 py-2 text-end font-bold tabular-nums text-red-700">{fmtMoney(b.totals.deductions)}</td>
                      <td className="px-3 py-2 text-end font-bold tabular-nums text-sky-900">{fmtMoney(b.totals.proposed)}</td>
                      <td className="px-3 py-2 text-end font-black tabular-nums text-sky-900">{fmtMoney(b.totals.final)}</td><td></td>
                    </tr>
                  )}
                  {b.departments.map((g) => (
                    <Fragment key={`${b.branch}/${g.name}`}>
                      <tr className="border-t border-slate-200 bg-slate-50/80" data-testid={`ps-group-${g.name}`}>
                        <td className="px-3 py-1.5 text-[11px] font-black text-slate-700" colSpan={9}>{g.name} <span className="font-normal text-slate-500">· {g.rows.length} موظفاً</span></td>
                      </tr>
                      {g.rows.map((r) => {
                        const opsTotal = r.ops_deduction_amount + (r.ops_deduction_days_amount ?? 0)
                        const paidDays = r.payable_days ?? r.days_present + (r.days_leave_paid ?? r.days_leave)
                        const dedParts = r.pay_type == null ? [] : [
                          (r.fixed_deductions_total ?? 0) > 0 && <span key="f">ثابتة {fmtMoney(r.fixed_deductions_total)}</span>,
                          opsTotal > 0 && <span key="o" className="text-amber-700" title={r.ops_deduction_reasons ?? ''}>عمليات {fmtMoney(opsTotal)}</span>,
                          (r.auto_deduction_amount ?? 0) > 0 && <span key="a" data-testid={`ps-auto-${r.employee_number}`} title={r.auto_deduction_rule ? `قاعدة: ${r.auto_deduction_rule}` : ''}>تلقائي {fmtMoney(r.auto_deduction_amount)}{(r.auto_deduction_days > 0 || r.auto_deduction_minutes > 0) && <> ({r.auto_deduction_days > 0 ? `${r.auto_deduction_days} يوم` : ''}{r.auto_deduction_days > 0 && r.auto_deduction_minutes > 0 ? ' + ' : ''}{r.auto_deduction_minutes > 0 ? `${r.auto_deduction_minutes} د` : ''})</>}</span>,
                          (r.advance_installment ?? 0) > 0 && <span key="v" className="text-amber-800" data-testid={`ps-advance-${r.employee_number}`}>سلفة {fmtMoney(r.advance_installment)}</span>,
                        ].filter(Boolean)
                        const proposedNet = r.proposed_net ?? 0
                        const finalNet = r.final_net ?? proposedNet
                        const adjusted = r.final_net != null && r.final_net !== proposedNet
                        return (
                          <tr key={r.row_id} className={clsx('border-t border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-brand-50/30', r.pay_type == null && 'bg-amber-50/50')} data-testid={`ps-row-${r.employee_number}`}>
                            <td className="px-3 py-2"><p className="text-sm font-semibold leading-tight">{r.full_name}</p><p className="text-[10px] text-slate-500" dir="ltr">{r.employee_number}{r.job_title ? ` · ${r.job_title}` : ''}</p></td>
                            <td className="px-3 py-2 text-center text-[11px] text-slate-600">{r.pay_type ? CONTRACT_LABELS[r.pay_type] : <span className="font-bold text-amber-700">غير مُعرَّف</span>}</td>
                            <td className="px-3 py-2 text-center tabular-nums" data-testid={`ps-days-count-${r.employee_number}`} title="حاضر (+ إجازة مدفوعة) / المجدولة / أيام الشهر">
                              <span className="font-bold text-emerald-700">{r.days_present}</span>{(r.days_leave_paid ?? r.days_leave) > 0 && <span className="text-sky-700" title="إجازة مدفوعة"> +{r.days_leave_paid ?? r.days_leave}</span>}<span className="text-slate-400"> / {r.scheduled_days != null ? `${r.scheduled_days} / ${r.working_days}` : r.working_days}</span>
                              {r.salary_model === 'earned_days' && r.pay_type === 'monthly' && r.payable_days != null && <span className="mx-auto mt-0.5 block w-fit rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-800" title="الأيام المستحقة (حضور + إجازة مدفوعة) من أيام الشهر — الراتب = أجر اليوم × هذه الأيام" data-testid={`ps-payable-${r.employee_number}`}>مستحق {r.payable_days}/{r.days_in_month}</span>}
                              {r.salary_model !== 'earned_days' && r.covered_days != null && r.days_in_month != null && r.covered_days < r.days_in_month && r.pay_type === 'monthly' && <span className="mx-auto mt-0.5 block w-fit rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800" title="الراتب الشهري محتسب بالنسبة والتناسب للفترة المشمولة فقط">مشمول {r.covered_days}/{r.days_in_month}</span>}
                              {(r.unevaluated_days ?? 0) > 0 && <span className="mx-auto mt-0.5 block w-fit rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700" title="أيام مجدولة بلا احتساب — اطلب من غرفة العمليات إعادة التصدير">{r.unevaluated_days} غير محتسب</span>}
                            </td>
                            <td className={clsx('px-3 py-2 text-center tabular-nums', r.days_absent > 0 ? 'font-bold text-red-700' : 'text-slate-400')}>{r.days_absent}{(r.days_leave_unpaid ?? 0) > 0 && <span className="block text-[10px] font-normal text-slate-500" data-testid={`ps-leave-${r.employee_number}`}>+{r.days_leave_unpaid} إجازة غير مدفوعة</span>}</td>
                            <td className="px-3 py-2 text-end tabular-nums" data-testid={`ps-gross-${r.employee_number}`}>{r.pay_type == null ? <span className="text-slate-300">—</span> : <><b>{fmtMoney(rowGross(r))}</b><span className="block text-[10px] text-slate-500">{r.pay_type === 'daily' ? `${fmtMoney(r.daily_rate)} × ${paidDays} يوم` : `أساسي ${fmtMoney(r.base_salary)}`}{(r.allowances_total ?? 0) > 0 ? ` + مخصصات ${fmtMoney(r.allowances_total)}` : ''}</span></>}</td>
                            <td className="px-3 py-2 text-end tabular-nums" data-testid={`ps-ded-${r.employee_number}`}>{r.pay_type == null ? <span className="text-slate-300">—</span> : rowDeductions(r) === 0 ? <span className="text-slate-400">0</span> : <><b className="text-red-700">{fmtMoney(rowDeductions(r))}</b><span className="flex flex-wrap justify-end gap-x-1.5 text-[10px] text-slate-500">{dedParts}</span></>}</td>
                            <td className="px-3 py-2 text-end tabular-nums text-slate-700" data-testid={`ps-proposed-${r.employee_number}`}>{r.pay_type == null ? <span className="text-slate-300">—</span> : fmtMoney(r.proposed_net)}</td>
                            <td className="px-3 py-2 text-end tabular-nums" title={r.finance_note ?? ''}>{r.pay_type == null ? <span className="text-slate-300">—</span> : <><span className={clsx('text-sm font-black', adjusted ? 'text-amber-700' : 'text-slate-900')}>{fmtMoney(finalNet)}</span>{adjusted && <span className="block text-[10px] font-bold text-amber-700">{finalNet > proposedNet ? '+' : '−'}{fmtMoney(Math.abs(finalNet - proposedNet))}{r.finance_note ? ` · ${r.finance_note}` : ''}</span>}</>}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-center">
                              <button type="button" className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100" onClick={() => setDetails(r)} data-testid={`ps-days-${r.employee_number}`}>التفاصيل</button>
                              {!approved && <button type="button" className="rounded-lg px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50" onClick={() => setEditing(r)} data-testid={`ps-edit-${r.employee_number}`}>تعديل</button>}
                            </td>
                          </tr>
                        )
                      })}
                      {g.rows.length > 1 && (
                        <tr className="border-t border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700" data-testid={`ps-subtotal-${g.name}`}>
                          <td className="px-3 py-1.5" colSpan={2}>مجموع {g.name}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-emerald-700">{g.totals.present}</td><td className="px-3 py-1.5 text-center tabular-nums text-red-700">{g.totals.absent}</td>
                          <td className="px-3 py-1.5 text-end tabular-nums">{fmtMoney(g.totals.gross)}</td>
                          <td className="px-3 py-1.5 text-end tabular-nums text-red-700">{fmtMoney(g.totals.deductions)}</td>
                          <td className="px-3 py-1.5 text-end tabular-nums">{fmtMoney(g.totals.proposed)}</td><td className="px-3 py-1.5 text-end tabular-nums">{fmtMoney(g.totals.final)}</td><td></td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black" data-testid="ps-grand-total">
                <td className="px-3 py-2.5" colSpan={2}>الإجمالي العام{filtered ? ' (حسب الفلتر)' : ''} · {tableTotals.count} موظفاً{missing > 0 && filters.profile !== 'missing' && !filtered ? <span className="font-normal text-slate-500"> (+ {missing} بلا ملف راتب خارج الجدول)</span> : null}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-emerald-700">{tableTotals.present}</td><td className="px-3 py-2.5 text-center tabular-nums text-red-700">{tableTotals.absent}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmtMoney(tableTotals.gross)}</td>
                <td className="px-3 py-2.5 text-end tabular-nums text-red-700">{fmtMoney(tableTotals.deductions)}{[['ثابتة', tableTotals.fixed], ['عمليات', tableTotals.ops], ['تلقائي', tableTotals.auto], ['سلف', tableTotals.advance]].filter(([, v]) => Number(v) > 0).length > 0 && <span className="block text-[10px] font-normal text-slate-500">{[['ثابتة', tableTotals.fixed], ['عمليات', tableTotals.ops], ['تلقائي', tableTotals.auto], ['سلف', tableTotals.advance]].filter(([, v]) => Number(v) > 0).map(([l, v]) => `${l} ${fmtMoney(Number(v))}`).join(' · ')}</span>}</td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmtMoney(tableTotals.proposed)}</td><td className="px-3 py-2.5 text-end text-sm tabular-nums text-emerald-800">{fmtMoney(tableTotals.final)}</td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editing && <AdjustPanel row={editing} onClose={() => setEditing(null)} />}
      {details && <DaysPanel row={details} month={month} onClose={() => setDetails(null)} />}
    </div>
  )
}

const PROFILE_LABELS: Record<ProfileFilter, string> = { all: 'كل الموظفين', defined: 'ملف راتب مُعرَّف', missing: 'بلا ملف راتب', adjusted: 'صافٍ معدَّل يدوياً', flagged: 'يحتاج انتباهاً' }

/** 00194 — لوحة التحقق الحسابي: كل صف مُعاد احتسابه من مكوّناته + مطابقة الحضورية الحية، مع شرح المعادلة */
function VerifyPanel({ rows, loading, filteredIds }: { rows: PayrollReconcileRow[]; loading: boolean; filteredIds: Set<string> | null }) {
  const [only, setOnly] = useState<'all' | 'issues'>('all')
  const list = useMemo(() => rows.filter((r) => (!filteredIds || filteredIds.has(r.employee_id)) && (only === 'all' || !r.ok)), [rows, filteredIds, only])
  const sum = reconcileSummary(rows)
  if (loading) return <LoadingSpinner />
  if (rows.length === 0) return <EmptyState title="لا كشف للتحقق منه" hint="يظهر التحقق بعد تصدير غرفة العمليات" />
  return (
    <div className="space-y-3" data-testid="ps-verify">
      <div className={clsx('rounded-2xl border p-3 text-xs', sum.money > 0 ? 'border-red-300 bg-red-50 text-red-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900')} data-testid="ps-verify-summary">
        <p className="text-sm font-black">{sum.money === 0 ? '✓ كل أرقام الكشف متطابقة حسابياً' : `✗ ${sum.money} صف غير متطابق حسابياً — الاعتماد ممنوع`}</p>
        <p className="mt-1">{sum.total} صف · متطابق كلياً {sum.ok} · فروق حضورية بعد التصدير {sum.attendance} · بلا ملف راتب {sum.missing}</p>
        <p className="mt-1 text-[11px] opacity-80">كيف نتحقق؟ لكل موظف: الإجمالي = الأساسي (أو أجر اليوم × الأيام المدفوعة) + المخصصات · الاستقطاعات = الثابتة + العمليات + أيام العمليات + التلقائي + قسط السلفة · الصافي = الإجمالي − الاستقطاعات (لا يقل عن صفر). ثم نقارن الحضورية الحية واستقطاعات العمليات الحالية بما صُدّر.</p>
      </div>
      <div className="flex gap-1 rounded-xl bg-slate-100 p-0.5 text-xs font-bold w-fit">
        <button type="button" className={clsx('rounded-lg px-3 py-1', only === 'all' ? 'bg-white shadow' : 'text-slate-600')} onClick={() => setOnly('all')} data-testid="ps-verify-all">الكل ({rows.length})</button>
        <button type="button" className={clsx('rounded-lg px-3 py-1', only === 'issues' ? 'bg-white shadow' : 'text-slate-600')} onClick={() => setOnly('issues')} data-testid="ps-verify-issues">بملاحظات ({rows.filter((r) => !r.ok).length})</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs" data-testid="ps-verify-table">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-start">الموظف</th><th className="p-2">الإجمالي<br /><span className="font-normal">مخزَّن / محسوب</span></th><th className="p-2">الاستقطاعات<br /><span className="font-normal">مخزَّنة / محسوبة</span></th><th className="p-2">الصافي<br /><span className="font-normal">مخزَّن / محسوب</span></th><th className="p-2">الحضورية الحية<br /><span className="font-normal">حاضر / غائب / إجازة</span></th><th className="p-2">النتيجة</th><th className="p-2 text-start">الملاحظات والمعادلة</th></tr></thead>
          <tbody>
            {list.map((r) => {
              const pair = (a: number | null, b: number | null) => <span className={clsx('tabular-nums', a != null && b != null && Math.round(a * 100) !== Math.round(b * 100) && 'font-black text-red-700')}>{fmtMoney(a)} / {fmtMoney(b)}</span>
              return (
                <tr key={r.row_id} className={clsx('border-t border-slate-100', !r.money_ok && 'bg-red-50/60', r.money_ok && !r.ok && 'bg-amber-50/40')} data-testid={`ps-verify-row-${r.employee_number}`} data-ok={String(r.ok)} data-money-ok={String(r.money_ok)}>
                  <td className="p-2"><p className="text-sm font-semibold">{r.full_name}</p><p className="text-[10px] text-slate-500">{r.employee_number} · {r.branch_name ?? 'بلا فرع'} / {r.department_name ?? 'بلا قسم'}</p></td>
                  <td className="p-2 text-center">{pair(r.gross_stored, r.gross_expected)}</td>
                  <td className="p-2 text-center">{pair(r.deductions_stored, r.deductions_expected)}</td>
                  <td className="p-2 text-center">{pair(r.net_stored, r.net_expected)}{r.final_net != null && r.final_net !== r.net_stored && <span className="block text-[10px] text-amber-700">معتمد {fmtMoney(r.final_net)}</span>}</td>
                  <td className="p-2 text-center tabular-nums"><span className={clsx(r.issues.includes('ATTENDANCE_CHANGED') && 'font-black text-amber-700')}>{r.live.present ?? '—'} / {r.live.absent ?? '—'} / {r.live.leave ?? '—'}</span><span className="block text-[10px] text-slate-500">في الكشف {String(r.components.present ?? '—')} / {String(r.components.absent ?? '—')} / {String(r.components.leave ?? '—')}</span></td>
                  <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', r.ok ? 'bg-emerald-100 text-emerald-800' : r.money_ok ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')}>{r.ok ? '✓ متطابق' : r.money_ok ? '⚠ تنبيه' : '✗ غير متطابق'}</span></td>
                  <td className="max-w-[28rem] p-2 text-[11px] leading-5">{r.issues.length > 0 && <p className="font-bold text-slate-800">{r.issues.map((k) => RECONCILE_ISSUE_LABELS[k] ?? k).join(' · ')}</p>}<p className="text-slate-600">{explainRow(r)}</p></td>
                </tr>
              )
            })}
            {list.length === 0 && <tr><td className="p-6 text-center text-slate-400" colSpan={7}>لا صفوف</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 00186 — كيف حُسب الصافي؟ معادلة مكتوبة بالأرقام حتى يراجعها المحاسب */
function FormulaBox({ row: r }: { row: PayrollSheetRow }) {
  const daily = r.pay_type === 'daily'
  const basisDays = r.day_rate != null && r.base_salary ? Math.round((r.base_salary / r.day_rate) * 100) / 100 : 30
  const dayRate = daily ? (r.daily_rate ?? 0) : r.day_rate != null ? Number(r.day_rate) : Math.round(((r.base_salary ?? 0) / 30) * 10000) / 10000
  const earned = !daily && r.salary_model === 'earned_days'
  const partial = !daily && !earned && r.covered_days != null && r.days_in_month != null && r.covered_days < r.days_in_month && (r.proration_ratio ?? 1) < 1
  const baseDue = earned ? Math.min(r.base_salary ?? 0, Math.round(dayRate * (r.payable_days ?? 0) * 100) / 100) : partial ? Math.min(r.base_salary ?? 0, Math.round(dayRate * (r.covered_days ?? 0) * 100) / 100) : (r.base_salary ?? 0)
  const minuteRate = Math.round((dayRate / Math.max(r.shift_minutes ?? 480, 1)) * 10000) / 10000
  const payable = r.payable_days ?? r.days_present + (r.days_leave_paid ?? 0)
  const autoDays = daily || earned ? (r.auto_shortfall_days ?? r.auto_deduction_days ?? 0) : (r.auto_deduction_days ?? 0)
  const gross = rowGross(r), ded = rowDeductions(r)
  const dec = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] leading-5 text-slate-700" data-testid="ps-formula">
      <p className="font-bold text-slate-800">كيف حُسب الصافي؟</p>
      <p>أجر اليوم = {daily ? `أجر اليوم ${fmtMoney(dayRate)}` : `${fmtMoney(r.base_salary)} ÷ ${basisDays} = ${dec(dayRate)}`} · أجر الدقيقة = {dec(dayRate)} ÷ {r.shift_minutes ?? 480} دقيقة = {dec(minuteRate)}</p>
      <p>الإجمالي = {daily ? `${payable} يوم مدفوع (حاضر ${r.days_present} + إجازة مدفوعة ${r.days_leave_paid ?? 0}) × ${fmtMoney(r.daily_rate)}` : earned ? <span data-testid="ps-earned">{`${payable} يوم مستحق (حاضر ${r.days_present + (r.days_incomplete ?? 0)} + إجازة مدفوعة ${r.days_leave_paid ?? 0}${(r.days_rest ?? 0) > 0 && payable > r.days_present + (r.days_incomplete ?? 0) + (r.days_leave_paid ?? 0) ? ` + راحة ${r.days_rest}` : ''}) من ${r.days_in_month} × أجر اليوم ${dec(dayRate)} = ${dec(baseDue)}`}{(r.days_absent ?? 0) > 0 && <span className="text-slate-500"> — {r.days_absent} يوم غياب غير مدفوع أصلاً فلا يُخصم مرة ثانية</span>}</span> : partial ? `الفترة المشمولة ${r.covered_days} من ${r.days_in_month} يوم (${r.period_from} → ${r.period_to}) × أجر اليوم ${dec(dayRate)} = ${dec(baseDue)}` : `الأساسي ${fmtMoney(r.base_salary)} (شهر مكتمل)`} + مخصصات {fmtMoney(r.allowances_total)}{partial ? ' (متناسبة)' : ''} = <b>{fmtMoney(gross)}</b>{partial && <span className="ms-1 rounded bg-sky-100 px-1 font-bold text-sky-800" data-testid="ps-prorated">راتب جزئي بالنسبة والتناسب</span>}{earned && <span className="ms-1 rounded bg-emerald-100 px-1 font-bold text-emerald-800" data-testid="ps-earned-badge">نموذج الأيام المستحقة</span>}</p>
      <p>الاستقطاعات = ثابتة {fmtMoney(r.fixed_deductions_total)} + عمليات {fmtMoney(r.ops_deduction_amount)}{r.ops_deduction_days > 0 ? ` + ${r.ops_deduction_days} يوم عمليات (${fmtMoney(r.ops_deduction_days_amount ?? r.ops_deduction_days * dayRate)})` : ''} + تلقائي ({r.auto_deduction_minutes ?? 0} دقيقة{autoDays > 0 ? ` + ${autoDays} يوم` : ''}{(daily || earned) && (r.auto_absence_days ?? 0) > 0 ? ` — أيام الغياب ${r.auto_absence_days} غير مدفوعة أصلاً فلا تُخصم` : ''}) = {fmtMoney(r.auto_deduction_amount)}{(r.advance_installment ?? 0) > 0 && <span data-testid="ps-advance-note"> + قسط سلفة {fmtMoney(r.advance_installment)}</span>}{r.auto_deduction_rule && <span className="ms-1 rounded bg-slate-100 px-1 font-bold text-slate-700" data-testid="ps-auto-rule">قاعدة «{r.auto_deduction_rule}»</span>}{r.auto_deduction_basis === 'disabled' && <span className="ms-1 font-bold text-slate-600" data-testid="ps-auto-disabled">(الاستقطاع التلقائي متوقف لهذا الموظف — وحدة الاستقطاعات التلقائية في التطوير المركزية)</span>}{r.auto_deduction_basis === 'fixed' && <span className="ms-1 text-slate-600" data-testid="ps-auto-fixed">(بمبالغ ثابتة من القاعدة لا من الراتب)</span>}{r.auto_deduction_days_capped && <span className="ms-1 font-bold text-amber-700" data-testid="ps-auto-days-capped">(أيام الاستقطاع مقيّدة بالسقف الشهري)</span>}{r.auto_deduction_capped && <span className="ms-1 font-bold text-amber-700" data-testid="ps-auto-capped">(قُيّد بسقف الاستقطاع التلقائي من سياسة التطوير المركزية)</span>} ⇒ <b>{fmtMoney(ded)}</b></p>
      <p>الصافي المقترح = {fmtMoney(gross)} − {fmtMoney(ded)} = <b>{fmtMoney(r.proposed_net)}</b>{(r.unevaluated_days ?? 0) > 0 && <span className="ms-1 font-bold text-rose-700">(غير نهائي: {r.unevaluated_days} يوم غير محتسب)</span>}</p>
    </div>
  )
}

/** تفاصيل أيام الموظف للشهر — شفافية الكشف للمالية (قراءة فقط) */
function DaysPanel({ row, month, onClose }: { row: PayrollSheetRow; month: string; onClose: () => void }) {
  const { data: days = [], isLoading } = useEmployeeMonthDays(row.employee_id, month)
  const { data: deductions = [] } = useEmployeeMonthDeductions(row.employee_id, month)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal="true" data-testid="ps-days-panel">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">أيام {row.full_name} — {month.slice(0, 7)}</h3><Button size="sm" variant="secondary" onClick={onClose}>إغلاق</Button></div>
        <p className="mb-2 text-[11px] text-slate-500">المصدر: محرك الحضور بعد تدقيق غرفة العمليات · الأوقات بتوقيت بغداد · الأيام المعدّلة يدوياً مُعلَّمة مع سببها</p>
        {row.pay_type && <FormulaBox row={row} />}
        {deductions.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-2" data-testid="ps-deductions-list">
            <p className="mb-1 text-[11px] font-bold text-amber-900">استقطاعات غرفة العمليات لهذا الشهر ({deductions.length})</p>
            <ul className="space-y-1 text-[11px]">
              {deductions.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2" data-testid={`ps-ded-item-${d.id}`}>
                  <span className="font-bold tabular-nums text-amber-800">{d.days > 0 ? `${d.days} يوم` : fmtMoney(d.amount)}</span>
                  <span className="text-slate-700">{d.reason}</span>
                  {d.disclosure_ref && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">كشف {d.disclosure_ref}{d.disclosure_type ? ` · ${d.disclosure_type}` : ''}{d.disclosure_date ? ` · ${d.disclosure_date}` : ''}</span>}
                  <span className="ms-auto text-slate-400">{d.created_by_name ?? ''} · {new Date(d.created_at).toLocaleDateString('ar-IQ-u-nu-latn')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isLoading ? <LoadingSpinner /> : days.length === 0 ? <p className="text-xs text-slate-400" data-testid="ps-days-empty">لا أيام حضور مسجّلة لهذا الموظف في الشهر (بلا بصمة أو لم يُحتسب بعد)</p> : (
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs" data-testid="ps-days-table">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2">اليوم</th><th className="p-2">الشفت</th><th className="p-2">دخول</th><th className="p-2">خروج</th><th className="p-2">تأخير</th><th className="p-2">مبكر</th><th className="p-2">مدة العمل</th><th className="p-2">نقص</th><th className="p-2">استقطاع مقترح</th><th className="p-2">الحالة</th><th className="p-2 text-start">ملاحظة</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.work_date} className={clsx('border-t border-slate-100', d.is_rest_day && 'bg-slate-50 text-slate-400')} data-testid={`ps-day-${d.work_date}`}>
                    <td className="whitespace-nowrap p-2 text-center tabular-nums">{d.work_date}</td><td className="p-2 text-center">{d.shift_name ?? '—'}</td>
                    <td className="p-2 text-center tabular-nums">{fmtTime(d.check_in)}</td><td className="p-2 text-center tabular-nums">{fmtTime(d.check_out)}</td>
                    <td className="p-2 text-center tabular-nums text-amber-700">{fmtMinutes(d.late_minutes)}</td><td className="p-2 text-center tabular-nums text-orange-700">{fmtMinutes(d.early_minutes)}</td>
                    <td className="p-2 text-center tabular-nums">{fmtMinutes(d.worked_minutes)}</td><td className="p-2 text-center tabular-nums">{fmtMinutes(d.shortfall_minutes)}</td>
                    <td className="p-2 text-center tabular-nums">{d.deduction_waived ? <span className="text-emerald-700" title={d.waive_reason ?? ''}>ملغى</span> : d.proposed_deduction_days > 0 ? `${d.proposed_deduction_days} يوم` : d.proposed_deduction_minutes > 0 ? fmtMinutes(d.proposed_deduction_minutes) : '—'}</td>
                    <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', STATUS_STYLES[d.status])}>{d.is_rest_day ? 'راحة' : ATTENDANCE_STATUS_LABELS[d.status]}</span></td>
                    <td className="p-2 text-[10px] text-slate-500">{d.source === 'manual' ? `تعديل يدوي: ${d.edit_reason ?? ''}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function AdjustPanel({ row, onClose }: { row: PayrollSheetRow; onClose: () => void }) {
  const adjust = useAdjustPayroll()
  const [net, setNet] = useState(String(row.final_net ?? row.proposed_net ?? 0)); const [note, setNote] = useState(row.finance_note ?? ''); const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    const v = Number(net); if (!Number.isFinite(v) || v < 0) { setErr('قيمة غير صالحة'); return }
    if (note.trim().length < 3) { setErr('سبب التعديل إلزامي'); return }
    setErr(null)
    try { await adjust.mutateAsync({ rowId: row.row_id, finalNet: v, note: note.trim() }); onClose() } catch { /* toast in hook */ }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal="true" data-testid="ps-adjust-panel">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <h3 className="text-sm font-bold">تعديل صافي {row.full_name}</h3>
        <p className="mb-3 text-[11px] text-slate-500">المقترح: {fmtMoney(row.proposed_net)} · أيام حاضر {row.days_present} · استقطاع العمليات {fmtMoney(row.ops_deduction_amount)}{row.ops_deduction_days ? ` + ${row.ops_deduction_days} يوم` : ''} · استقطاع تلقائي {fmtMoney(row.auto_deduction_amount ?? 0)}</p>
        <div className="space-y-3">
          <Field id="adj-net" label="الصافي المعتمد (د.ع)"><input id="adj-net" type="number" min={0} step={250} className={field} value={net} onChange={(e) => setNet(e.target.value)} data-testid="adj-net" /></Field>
          <Field id="adj-note" label="سبب التعديل *"><textarea id="adj-note" className={clsx(field, 'h-20 py-2')} value={note} onChange={(e) => setNote(e.target.value)} data-testid="adj-note" /></Field>
          {err && <p className="text-xs font-bold text-red-600" role="alert">{err}</p>}
        </div>
        <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>إلغاء</Button><Button size="sm" onClick={() => void save()} isLoading={adjust.isPending} data-testid="adj-save">حفظ</Button></div>
      </div>
    </div>
  )
}

// ── ملفات الرواتب: SalaryProfiles.tsx (00206) ──

// ── الإشعارات ──
function NoticesTab({ onDefine }: { onDefine: () => void }) {
  const { data: notices = [], isLoading } = useFinanceNotices(); const done = useMarkNoticeDone()
  if (isLoading) return <LoadingSpinner />
  if (notices.length === 0) return <EmptyState title="لا إشعارات معلّقة من الموارد البشرية" hint="تظهر هنا الرواتب بانتظار التعريف وطلبات تسوية نهاية الخدمة" />
  return (
    <ul className="space-y-2" data-testid="notices-tab">
      {notices.map((n) => (
        <li key={n.id} className={clsx('flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 shadow-sm', n.kind === 'termination_settlement' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40')} data-testid={`notice-${n.kind}-${n.employees?.employee_number}`}>
          <div>
            <p className="text-sm font-bold">{n.kind === 'salary_pending' ? 'راتب بانتظار التعريف' : 'تسوية نهاية خدمة'} — {n.employees?.full_name}</p>
            <p className="text-[11px] text-slate-600">{n.employees?.employee_number} · {n.employees ? CONTRACT_LABELS[n.employees.contract_type] : ''}
              {n.kind === 'termination_settlement' && <> · {TERMINATION_LABELS[(n.payload.type as TerminationType) ?? 'resignation'] ?? ''} · آخر يوم {String(n.payload.last_day ?? '')} · {String(n.payload.reason ?? '')}</>}
              · {new Date(n.created_at).toLocaleDateString('ar-IQ-u-nu-latn')}</p>
          </div>
          <div className="flex gap-2">
            {n.kind === 'salary_pending' && <Button size="sm" onClick={onDefine}>تعريف الراتب</Button>}
            <Button size="sm" variant="secondary" onClick={() => done.mutate(n.id)} isLoading={done.isPending} data-testid={`notice-done-${n.id}`}>تمت المعالجة</Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
