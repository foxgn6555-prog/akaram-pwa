/**
 * غرفة العمليات — وحدة «الحضوريات» بمرحلتين (00193)
 *   المرحلة 1 «التدقيق التفصيلي»: سجلات اليوم/الشهر + شبكة الشهر بالأوقات (موظف × أيام) · تعديل أي صف بسبب إلزامي + سجل تدقيق
 *     · استقطاعات يدوية · تصدير Excel تفصيلي (ورقة لكل قسم) · «اعتماد حضورية الشهر».
 *   المرحلة 2 «الكشف المعتمد»: بعد الاعتماد فقط — كل يوم حاضر/غائب/مجاز + ملخص كل موظف (ساعات العمل، أيام الحضور/الغياب/الإجازة)
 *     · تصدير Excel معتمد (ورقة لكل قسم) · «تصدير بيانات الشهر إلى المالية» (ممنوع قبل الاعتماد) · إعادة الفتح بسبب (يُبلَّغ التطوير).
 *   00198: تنقّل واحد (شريط المراحل) · شريحة حالة الشهر · بطاقة «حالة الشهر» موحّدة بدل اللافتات المتناثرة · «جاهزية الاعتماد» · بطاقة «التصدير إلى المالية» بحالة صريحة.
 */
import { useMemo, useState } from 'react'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, WEEKDAYS_AR,
  useAddDeduction, useAttendance, useAttendanceAudit, useAttendanceConfirmation, useAttendanceGrid, useConfirmAttendanceMonth, useDeductions, useDeleteDeduction, useEditAttendance, useEvaluateAttendance, useEvaluateMonth, useExportMonth, useMonthExportStatus, useMonthExports, useReopenAttendanceMonth, useResetAttendance, useWaiveDeduction,
} from '@features/hr'
import type { AttendanceDayRow as AttendanceDay, AttendanceStatus } from '@features/hr'
import { buildAttendanceApprovedWorkbook, buildAttendanceDetailedWorkbook, downloadWorkbook, fmtHM } from '@features/hr/lib/attendanceExcel'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { Field, MonthPicker, StatCard, StatusBadge } from '@portals/hr/components/hr-ui'
import { field, fmtMinutes, fmtMoney, fmtTime, isoDay, monthStart, proposedLabel } from '@portals/hr/components/hr-format'
import { UnmatchedPunchesPanel } from '@portals/hr/components/UnmatchedPunchesPanel'
import { GridLegend, MonthGrid, MonthStateChip, SectionCard, StageBar, StatusLine, type Stage } from './AttendanceStages'

type Mode = 'day' | 'month'
const AUDIT_LABELS: Record<string, string> = { edit: 'تعديل', reset_auto: 'إعادة احتساب', deduction_add: 'إضافة استقطاع', deduction_delete: 'حذف استقطاع', export: 'تصدير شهر', approve: 'اعتماد المالية', waive: 'إلغاء استقطاع مقترح', unwaive: 'إعادة استقطاع مقترح', confirm: 'اعتماد حضورية الشهر', reopen: 'إعادة فتح الحضورية', auto_blocked: 'تغيير تلقائي مُعلَّق بعد الاعتماد' }
const EDITABLE: AttendanceStatus[] = ['present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit']

export default function OpsAttendancePage() {
  const [stage, setStage] = useState<Stage>('detailed')
  const [mode, setMode] = useState<Mode>('day')
  const [day, setDay] = useState(isoDay())
  const [month, setMonth] = useState(monthStart())
  const [branchId, setBranchId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState<AttendanceStatus | ''>('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AttendanceDay | null>(null)
  const [auditFor, setAuditFor] = useState<AttendanceDay | null>(null)
  const [deductFor, setDeductFor] = useState<AttendanceDay | null>(null)
  const [panel, setPanel] = useState<'rows' | 'grid' | 'deductions' | 'exports'>('rows')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [busyExcel, setBusyExcel] = useState(false)
  const waive = useWaiveDeduction()

  const { data: departments = [] } = useDepartments()
  const { data: branches = [] } = useBranches()
  const range = useMemo(() => mode === 'day' ? { from: day, to: day } : { from: month, to: isoDay(new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0)) }, [mode, day, month])
  const { data: rows = [], isLoading } = useAttendance({ ...range, branchId: branchId || null, departmentId: departmentId || null, status: status || null, search })
  const gridFilters = useMemo(() => ({ month, branchId: branchId || null, departmentId: departmentId || null, search: search || null }), [month, branchId, departmentId, search])
  const needGrid = stage === 'approved' || panel === 'grid' || confirmOpen
  const { data: grid = [], isLoading: gridLoading } = useAttendanceGrid(gridFilters, needGrid)
  const { data: conf } = useAttendanceConfirmation(month)
  const confirmMonth = useConfirmAttendanceMonth()
  const reopenMonth = useReopenAttendanceMonth()
  const evaluate = useEvaluateAttendance()
  const exportMonth = useExportMonth()
  const { data: exports = [] } = useMonthExports()
  const monthExport = exports.find((x) => x.period_month === month)
  const { data: exportStatus } = useMonthExportStatus(month)
  const evaluateMonth = useEvaluateMonth()
  const counts = useMemo(() => Object.fromEntries(ATTENDANCE_STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<AttendanceStatus, number>, [rows])
  const locked = monthExport?.status === 'approved' || !!conf?.locked
  const confirmed = !!conf?.confirmed && !locked
  /** التعديل مقفل بعد اعتماد المالية، أو بعد اعتماد الحضورية (حتى إعادة الفتح) */
  const frozen = locked || confirmed
  const proposedTotals = useMemo(() => rows.reduce((a, r) => {
    if (r.deduction_waived) { a.waived += 1; return a }
    const m = r.proposed_deduction_minutes ?? 0, d = r.proposed_deduction_days ?? 0
    a.minutes += m; a.days += d; if (m > 0 || d > 0) a.count += 1; return a
  }, { minutes: 0, days: 0, count: 0, waived: 0 }), [rows])
  /** 00198 — قائمة جاهزية الاعتماد: ما الذي يجب حسمه قبل «اعتماد حضورية الشهر» */
  const readiness = useMemo(() => {
    const uneval = exportStatus?.unevaluated_days ?? 0
    const scope = mode === 'day' ? `في يوم ${day}` : `في شهر ${month.slice(0, 7)}`
    const items = [
      { key: 'unevaluated', ok: uneval === 0, label: uneval === 0 ? 'كل الأيام محتسبة' : `${uneval} يوم غير محتسب`, hint: uneval === 0 ? 'لا أيام بلا احتساب في الشهر' : `لدى ${exportStatus?.unevaluated_employees ?? 0} موظف — يُحتسب تلقائياً عند الاعتماد`, go: () => evaluateMonth.mutate(month), goLabel: 'احتسب الآن' },
      { key: 'incomplete', ok: counts.incomplete === 0, label: counts.incomplete === 0 ? 'لا بصمات ناقصة' : `${counts.incomplete} بصمة ناقصة`, hint: counts.incomplete === 0 ? scope : `${scope} — ستُعدّ «حاضر» إن تُركت`, go: () => { setStatus('incomplete'); setPanel('rows') }, goLabel: 'عرضها' },
      { key: 'proposed', ok: proposedTotals.count === 0, label: proposedTotals.count === 0 ? 'لا استقطاعات مقترحة معلّقة' : `${proposedTotals.count} استقطاع مقترح`, hint: proposedTotals.count === 0 ? scope : `${scope} — راجعها أو ألغِها بسبب قبل الاعتماد`, go: () => setPanel('deductions'), goLabel: 'المراجعة' },
      { key: 'scope', ok: mode === 'month', label: mode === 'month' ? 'عرض الشهر كاملاً' : 'العرض الحالي يوم واحد', hint: mode === 'month' ? 'الأرقام أعلاه تغطي الشهر كله' : 'انتقل إلى عرض الشهر للتحقق من كامل الشهر قبل الاعتماد', go: () => setMode('month'), goLabel: 'عرض الشهر' },
    ]
    const open = items.filter((i) => !i.ok).length
    return { items, open, ok: open === 0 }
  }, [exportStatus, counts, proposedTotals, mode, day, month, evaluateMonth])
  const gridTotals = useMemo(() => grid.reduce((a, r) => { a.emp += 1; a.present += r.present_days + r.late_days + r.early_days + r.incomplete_days; a.absent += r.absent_days; a.leave += r.leave_days; a.minutes += r.worked_minutes; a.incomplete += r.incomplete_days; a.unevaluated += r.unevaluated_days; a.manual += r.days.filter((c) => c.src === 'manual').length; return a }, { emp: 0, present: 0, absent: 0, leave: 0, minutes: 0, incomplete: 0, unevaluated: 0, manual: 0 }), [grid])
  const toggleWaive = async (r: AttendanceDay) => {
    const reason = window.prompt((r.deduction_waived ? 'سبب إعادة الاستقطاع المقترح:' : 'سبب إلغاء الاستقطاع المقترح (إلزامي):') + '\nسيتم تبليغ وحدة التطوير المركزية بهذا الإجراء.')
    if (!reason || reason.trim().length < 3) return
    try { await waive.mutateAsync({ employeeId: r.employee_id, date: r.work_date, waive: !r.deduction_waived, reason: reason.trim() }) } catch { /* toast in hook */ }
  }
  const branchLabel = branches.find((b) => b.id === branchId)?.name ?? 'كل الفروع'
  const departmentLabel = departments.find((d) => d.id === departmentId)?.name ?? 'كل الأقسام'
  const doExport = async () => {
    if (locked || !conf?.can_export) return
    if (!window.confirm((monthExport ? 'يوجد تصدير سابق لهذا الشهر لم تعتمده المالية بعد — سيُستبدل بلقطة جديدة.' : 'سيُنشأ ملف شهري يُرسل إلى المالية من الكشف المعتمد.') + '\nمتابعة؟')) return
    try { await exportMonth.mutateAsync(month) } catch { /* toast in hook */ }
  }
  const doExcel = async (kind: Stage) => {
    if (!grid.length) return
    setBusyExcel(true)
    try {
      const meta = { month, branchLabel, departmentLabel, search: search || undefined, confirmedBy: conf?.confirmed_by_name, confirmedAt: conf?.confirmed_at }
      const wb = kind === 'detailed' ? await buildAttendanceDetailedWorkbook(grid, meta) : await buildAttendanceApprovedWorkbook(grid, meta)
      await downloadWorkbook(wb, `${kind === 'detailed' ? 'الحضوريات-التفصيلية' : 'كشف-الحضورية-المعتمد'}-${month.slice(0, 7)}.xlsx`)
    } finally { setBusyExcel(false) }
  }
  const doConfirm = async () => {
    try { await confirmMonth.mutateAsync(month); setConfirmOpen(false); setStage('approved') } catch { /* toast in hook */ }
  }

  return (
    <div className="space-y-4" data-testid="ops-attendance">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">الحضوريات</h1>
          <p className="text-xs text-slate-500">تدقيق تفصيلي بالأوقات ← اعتماد الشهر ← كشف معتمد (حاضر / غائب / مجاز) ← تصدير للمالية · كل تعديل بسبب موثّق باسم المدقق</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={(v) => { setMonth(v); if (mode === 'day') setMode('month') }} testId="att-month" />
          <MonthStateChip conf={conf} />
          {locked && <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-white" data-testid="att-locked">🔒 الشهر مقفل باعتماد المالية</span>}
          {stage === 'detailed' && !locked && (
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={confirmed && (conf?.pending_auto ?? 0) === 0} data-testid="att-confirm-open" title={confirmed ? 'معتمد — يمكن إعادة الاعتماد عند وجود تغييرات معلّقة' : readiness.ok ? '' : `${readiness.open} نقاط تحتاج مراجعة — يمكنك الاعتماد بعد الاطلاع عليها`}>
              <Icon name="check" size={14} /> {confirmed ? 'معتمد ✓' : conf?.status === 'reopened' ? 'إعادة اعتماد حضورية الشهر' : 'اعتماد حضورية الشهر'}
            </Button>
          )}
        </div>
      </header>

      <StageBar conf={conf} stage={stage} onStage={setStage} />

      {stage === 'detailed' && (
        <>
          {(confirmed || (conf?.status === 'reopened' && !locked) || ((exportStatus?.unevaluated_days ?? 0) > 0 && !locked) || locked) && (
            <SectionCard title={`حالة شهر ${month.slice(0, 7)}`} testId="att-month-status">
              {locked && <StatusLine tone="slate" icon="lock" testId="att-locked-line">اعتمدت المالية كشف هذا الشهر وأُقفل نهائياً — العرض للاطلاع فقط ولا يمكن التعديل أو إعادة الفتح.</StatusLine>}
              {confirmed && (
                <StatusLine tone="emerald" icon="check" role="status" testId="att-confirmed-banner" action={<Button size="sm" variant="secondary" onClick={() => setStage('approved')} data-testid="att-go-approved">فتح الكشف المعتمد</Button>}>
                  <b>حضورية {month.slice(0, 7)} معتمدة</b> بواسطة {conf?.confirmed_by_name ?? '—'} في {conf?.confirmed_at ? new Date(conf.confirmed_at).toLocaleString('ar-IQ-u-nu-latn') : '—'} — التعديل مقفل؛ لأي تعديل أعد فتح الشهر بسبب من «الكشف المعتمد».
                </StatusLine>
              )}
              {conf?.status === 'reopened' && !locked && (
                <StatusLine tone="amber" icon="alert-triangle" role="status" testId="att-reopened-banner">
                  <b>الشهر مُعاد فتحه</b> بواسطة {conf.reopened_by_name ?? '—'} — السبب: {conf.reopen_reason} · أكمل التعديلات ثم أعد الاعتماد.
                </StatusLine>
              )}
              {(exportStatus?.unevaluated_days ?? 0) > 0 && !locked && (
                <StatusLine tone="rose" icon="alert-triangle" role="status" testId="ops-unevaluated-banner" action={<Button size="sm" variant="secondary" isLoading={evaluateMonth.isPending} onClick={() => evaluateMonth.mutate(month)} data-testid="ops-evaluate-month">احتساب الشهر كاملاً الآن</Button>}>
                  <b>{exportStatus!.unevaluated_days} يوم عمل غير محتسب</b> لدى {exportStatus!.unevaluated_employees} موظف في شهر {month.slice(0, 7)} — أيام بلا بصمة لم يُحتسب غيابها بعد (اعتماد الشهر يحتسبها تلقائياً).
                </StatusLine>
              )}
            </SectionCard>
          )}
          <SectionCard title={mode === 'day' ? `ملخص يوم ${day}` : `ملخص شهر ${month.slice(0, 7)}`} badge={<span className="text-[11px] text-slate-500" data-testid="ops-rows-count">{rows.length} سجلاً{status ? ` · مُرشَّح: ${ATTENDANCE_STATUS_LABELS[status]}` : ''}</span>}>
            <div className="flex flex-wrap gap-1.5" data-testid="ops-status-chips">
              {ATTENDANCE_STATUS_ORDER.map((s) => {
                const tone = s === 'absent' ? 'bg-rose-50 text-rose-800 ring-rose-200' : s === 'late' || s === 'early_leave' ? 'bg-amber-50 text-amber-800 ring-amber-200' : s === 'present' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : s === 'incomplete' ? 'bg-violet-50 text-violet-800 ring-violet-200' : 'bg-sky-50 text-sky-800 ring-sky-200'
                return (
                  <button key={s} type="button" onClick={() => setStatus(status === s ? '' : s)} className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition', tone, status === s ? 'ring-2 ring-brand-500' : counts[s] === 0 && 'opacity-50')} data-testid={`ops-stat-${s}`} aria-pressed={status === s}>
                    <span>{ATTENDANCE_STATUS_LABELS[s]}</span><span className="rounded-full bg-white/80 px-1.5 tabular-nums">{counts[s]}</span>
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-4" data-testid="ops-proposed-summary">
              <StatCard title="أيام بها استقطاع مقترح" value={proposedTotals.count} tone="amber" testId="ops-proposed-count" />
              <StatCard title="دقائق مقترحة (غير ملغاة)" value={fmtMinutes(proposedTotals.minutes)} tone="amber" testId="ops-proposed-minutes" />
              <StatCard title="أيام مقترحة (غير ملغاة)" value={proposedTotals.days} tone="red" testId="ops-proposed-days" />
              <StatCard title="استقطاعات ألغتها غرفة العمليات" value={proposedTotals.waived} tone="emerald" testId="ops-proposed-waived" hint="بسبب موثّق في سجل التدقيق" />
            </div>
          </SectionCard>

          {!frozen && (
            <SectionCard title="جاهزية الاعتماد" testId="att-readiness" badge={<span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', readiness.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')} data-testid="att-readiness-state">{readiness.ok ? '✓ جاهز للاعتماد' : `${readiness.open} نقاط تحتاج مراجعة`}</span>}>
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {readiness.items.map((it) => (
                  <li key={it.key} className={clsx('flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] ring-1', it.ok ? 'bg-emerald-50/60 text-emerald-900 ring-emerald-100' : 'bg-amber-50/60 text-amber-900 ring-amber-200')} data-testid={`att-ready-${it.key}`} data-ok={it.ok}>
                    <span className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black', it.ok ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white')}>{it.ok ? '✓' : '!'}</span>
                    <span className="min-w-0 flex-1"><span className="block font-bold">{it.label}</span><span className="block text-[10px] opacity-80">{it.hint}</span></span>
                    {!it.ok && it.go && <button type="button" className="shrink-0 rounded-lg bg-white px-2 py-1 font-bold text-amber-900 ring-1 ring-amber-300" onClick={it.go}>{it.goLabel}</button>}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* 00205 — شريط واحد: أقسام التدقيق + الفلاتر + أدوات (بدل شريطين) */}
          <div className="sticky top-0 z-20 space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur" data-testid="ops-toolbar">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold" aria-label="أقسام التدقيق">
                {([['rows', 'سجلات الحضور', rows.length], ['grid', 'شبكة الشهر (الأوقات)', null], ['deductions', 'الاستقطاعات', proposedTotals.count || null], ['exports', 'تصديرات الأشهر', null]] as const).map(([k, l, n]) => (
                  <button key={k} type="button" onClick={() => setPanel(k)} className={clsx('inline-flex items-center gap-1 rounded-lg px-3 py-1.5', panel === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} data-testid={`panel-${k}`} aria-pressed={panel === k}>
                    {l}{n != null && n > 0 && <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', panel === k ? 'bg-brand-50 text-brand-700' : 'bg-white text-slate-600')}>{n}</span>}
                  </button>
                ))}
              </nav>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" isLoading={evaluate.isPending} disabled={frozen} onClick={() => evaluate.mutate(range)} data-testid="ops-evaluate" title="إعادة احتساب النطاق الحالي من البصمات"><Icon name="refresh" size={14} /> إعادة الاحتساب</Button>
                <Button size="sm" variant="secondary" isLoading={busyExcel} disabled={!grid.length && !needGrid} onClick={() => { setPanel('grid'); void doExcel('detailed') }} data-testid="att-excel-detailed"><Icon name="file-spreadsheet" size={14} /> Excel تفصيلي</Button>
              </div>
            </div>
            {(panel === 'rows' || panel === 'grid') && (
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="ops-filters">
                {panel === 'rows' ? (
                  <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
                    <button type="button" onClick={() => setMode('day')} className={clsx('rounded-lg px-3 py-1.5', mode === 'day' && 'bg-white shadow')} data-testid="mode-day">يوم</button>
                    <button type="button" onClick={() => setMode('month')} className={clsx('rounded-lg px-3 py-1.5', mode === 'month' && 'bg-white shadow')} data-testid="mode-month">شهر</button>
                    {mode === 'day' ? <input type="date" className={clsx(field, 'h-8 flex-1 py-0')} value={day} onChange={(e) => setDay(e.target.value)} data-testid="ops-day" /> : <span className="flex-1 px-2 text-center text-slate-600" data-testid="ops-month-label">{month.slice(0, 7)}</span>}
                  </div>
                ) : <span className="flex items-center rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-600" data-testid="ops-month-label">شهر {month.slice(0, 7)}</span>}
                <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="ops-branch"><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="ops-dept"><option value="">كل الأقسام (بفروعها)</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.parent_id ? '↳ ' : ''}{d.name}</option>)}</select>
                {panel === 'rows' ? <select className={field} value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus | '')} data-testid="ops-status"><option value="">كل الحالات</option>{ATTENDANCE_STATUS_ORDER.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}</select> : <span />}
                <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ops-search" />
              </div>
            )}
          </div>

          {panel === 'rows' && <UnmatchedPunchesPanel from={range.from} to={range.to} />}
          {panel === 'grid' && (gridLoading ? <LoadingSpinner /> : grid.length === 0 ? <EmptyState title="لا موظفين ببصمة في هذا النطاق" hint="وسّع الفلاتر" /> : (
            <div className="space-y-2">
              <GridLegend mode="detailed" />
              <MonthGrid rows={grid} mode="detailed" onCellClick={(r, c) => { setMode('day'); setDay(c.d); setSearch(r.employee_number); setStatus(''); setPanel('rows') }} />
            </div>
          ))}
          {panel === 'rows' && (isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا سجلات في هذا النطاق" hint="جرّب «إعادة الاحتساب» أو وسّع الفلاتر" /> : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm" data-testid="ops-table">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr><th className="p-2 text-start">اليوم</th><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القسم / الفرع</th><th className="p-2">الشفت</th><th className="p-2">دخول</th><th className="p-2">خروج</th><th className="p-2">تأخير</th><th className="p-2">مبكر</th><th className="p-2">نقص</th><th className="p-2">إضافي</th><th className="p-2">استقطاع مقترح</th><th className="p-2">الحالة</th><th className="p-2">إجراءات</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={clsx('border-t border-slate-100', r.source === 'manual' && 'bg-amber-50/40')} data-testid={`ops-row-${r.employee_number}-${r.work_date}`}>
                      <td className="p-2 text-xs">{r.work_date}<span className="block text-[10px] text-slate-400">{WEEKDAYS_AR[new Date(r.work_date).getDay()]}</span></td>
                      <td className="p-2"><p className="font-semibold">{r.full_name}</p><p className="text-[11px] text-slate-500">{r.employee_number}</p></td>
                      <td className="p-2 text-xs">{r.department_name ?? '—'}<span className="block text-[10px] text-slate-400">{r.branch_name ?? ''}</span></td>
                      <td className="p-2 text-center text-xs">{r.shift_name ?? '—'}<span className="block text-[10px] text-slate-400" dir="ltr">{r.expected_in ? `${fmtTime(r.expected_in)}–${fmtTime(r.expected_out)}` : ''}</span></td>
                      <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_in)}</td>
                      <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_out)}</td>
                      <td className={clsx('p-2 text-center text-xs', r.late_minutes > 0 && 'font-bold text-amber-700')}>{fmtMinutes(r.late_minutes)}</td>
                      <td className={clsx('p-2 text-center text-xs', r.early_minutes > 0 && 'font-bold text-orange-700')}>{fmtMinutes(r.early_minutes)}</td>
                      <td className={clsx('p-2 text-center text-xs tabular-nums', r.shortfall_minutes > 0 && 'font-bold text-red-700')} title={r.permit_minutes > 0 ? `زمنية معتمدة ${fmtMinutes(r.permit_minutes)}` : ''} data-testid={`ops-shortfall-${r.employee_number}-${r.work_date}`}>{fmtMinutes(r.shortfall_minutes)}{r.permit_minutes > 0 && <span className="block text-[10px] text-violet-600">زمنية {fmtMinutes(r.permit_minutes)}</span>}</td>
                      <td className={clsx('p-2 text-center text-xs tabular-nums', r.overtime_minutes > 0 && 'font-bold text-emerald-700')}>{fmtMinutes(r.overtime_minutes)}</td>
                      <td className="p-2 text-center text-xs" data-testid={`ops-proposed-${r.employee_number}-${r.work_date}`}>
                        {r.proposed_deduction_minutes > 0 || r.proposed_deduction_days > 0 ? (
                          <div>
                            <span className={clsx('font-bold', r.deduction_waived ? 'text-slate-400 line-through' : 'text-red-700')}>{proposedLabel(r)}</span>
                            {r.deduction_reason && <span className="block max-w-[10rem] truncate text-[10px] text-slate-500" title={r.deduction_reason}>{r.deduction_reason}</span>}
                            {r.deduction_waived && <span className="block text-[10px] font-bold text-emerald-700" title={r.waive_reason ?? ''}>مُلغى: {r.waive_reason}</span>}
                            {!frozen && <button type="button" className="mt-0.5 text-[10px] font-bold text-brand-700 hover:underline" onClick={() => void toggleWaive(r)} data-testid={`ops-waive-${r.employee_number}-${r.work_date}`}>{r.deduction_waived ? 'إعادة الاستقطاع' : 'إلغاء بسبب'}</button>}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="p-2 text-center"><StatusBadge status={r.status} source={r.source} />{r.edit_reason && <p className="mt-0.5 max-w-[10rem] truncate text-[10px] text-slate-500" title={r.edit_reason}>{r.edit_reason}</p>}</td>
                      <td className="p-2">
                        <div className="flex justify-center gap-1">
                          <button type="button" className="rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-700 disabled:opacity-40" onClick={() => setEditing(r)} disabled={frozen} title={confirmed ? 'الشهر معتمد — أعد فتحه أولاً' : ''} data-testid={`ops-edit-${r.employee_number}-${r.work_date}`}>تعديل</button>
                          <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 disabled:opacity-40" onClick={() => setDeductFor(r)} disabled={frozen} data-testid={`ops-deduct-${r.employee_number}`}>استقطاع</button>
                          <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700" onClick={() => setAuditFor(r)} data-testid={`ops-audit-${r.employee_number}-${r.work_date}`}>سجل</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {panel === 'deductions' && <DeductionsPanel month={month} locked={frozen} />}
          {panel === 'exports' && <ExportsPanel />}
        </>
      )}

      {stage === 'approved' && (
        !conf?.confirmed && !locked ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center" data-testid="att-approved-locked">
            <Icon name="lock" size={28} className="mx-auto text-slate-300" />
            <h2 className="mt-2 text-base font-black">الكشف المعتمد غير متاح بعد</h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">أكمل التدقيق التفصيلي لشهر {month.slice(0, 7)} ثم اضغط «اعتماد حضورية الشهر». بعدها يظهر هنا الكشف النهائي (حاضر / غائب / مجاز) ويُفتح التصدير إلى المالية.</p>
            <Button size="sm" className="mt-3" onClick={() => setStage('detailed')} data-testid="att-back-detailed">العودة إلى التدقيق التفصيلي</Button>
          </div>
        ) : (
          <>
            <SectionCard title={`كشف ${month.slice(0, 7)} المعتمد`} testId="att-approved-status" badge={!locked ? <Button size="sm" variant="ghost" onClick={() => setReopenOpen(true)} data-testid="att-reopen-open">إعادة فتح الشهر بسبب</Button> : undefined}>
              <StatusLine tone="emerald" icon="check" testId="att-approved-banner">
                اعتمده <b>{conf?.confirmed_by_name ?? '—'}</b> في {conf?.confirmed_at ? new Date(conf.confirmed_at).toLocaleString('ar-IQ-u-nu-latn') : '—'}{(conf?.confirm_count ?? 0) > 1 ? ` (الاعتماد رقم ${conf?.confirm_count})` : ''} · {conf?.employees ?? grid.length} موظفاً
              </StatusLine>
              {(conf?.pending_auto ?? 0) > 0 && !locked && (
                <StatusLine tone="amber" icon="alert-triangle" role="status" testId="att-pending-banner" action={<Button size="sm" isLoading={confirmMonth.isPending} onClick={() => void doConfirm()} data-testid="att-reconfirm">إعادة الاعتماد (تطبيق التغييرات)</Button>}>
                  <b>{conf!.pending_auto} يوم</b> وصلته تغييرات تلقائية بعد الاعتماد (بصمات متأخرة / إجازات اعتُمدت لاحقاً) ولم تُطبَّق: {conf!.pending_days.slice(0, 4).map((p) => `${p.full_name} ${p.work_date.slice(5)}`).join('، ')}{conf!.pending_days.length > 4 ? ' …' : ''} — التصدير للمالية متوقف حتى إعادة الاعتماد.
                </StatusLine>
              )}
              {(conf?.deductions_after ?? 0) > 0 && !locked && (
                <StatusLine tone="violet" testId="att-deductions-after">وصل {conf!.deductions_after} استقطاع من كشوفات معتمدة بعد الاعتماد — سيُضمَّن في التصدير للمالية تلقائياً.</StatusLine>
              )}
              {exportStatus?.needs_reexport && !locked && (
                <StatusLine tone="amber" icon="alert-triangle" role="status" testId="ops-reexport-banner" action={<Button size="sm" isLoading={exportMonth.isPending} disabled={!conf?.can_export} onClick={() => void doExport()} data-testid="ops-reexport-now">إعادة التصدير الآن</Button>}>
                  <b>يلزم إعادة تصدير شهر {month.slice(0, 7)}:</b> حدثت {exportStatus.changes_after} تغييرات بعد آخر تصدير (الإصدار v{exportStatus.version}){exportStatus.deductions_after > 0 ? ` منها ${exportStatus.deductions_after} استقطاعات` : ''}{exportStatus.disclosure_deductions_after > 0 ? ` (${exportStatus.disclosure_deductions_after} من كشوفات معتمدة)` : ''} — كشف المالية الحالي لا يتضمنها.
                </StatusLine>
              )}
            </SectionCard>

            <SectionCard title="التصدير إلى المالية" testId="att-export-card" badge={
              <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', locked ? 'bg-slate-800 text-white' : monthExport ? (exportStatus?.needs_reexport ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900') : 'bg-slate-100 text-slate-700')} data-testid="att-export-state">
                {locked ? '🔒 اعتمدته المالية' : monthExport ? (exportStatus?.needs_reexport ? `v${monthExport.version} · يلزم إعادة التصدير` : `v${monthExport.version} · بانتظار اعتماد المالية`) : 'لم يُصدَّر بعد'}
              </span>}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[11px] text-slate-600">
                  {locked ? `اعتمدت المالية الإصدار v${monthExport?.version ?? exportStatus?.version ?? 1} وأُقفل الشهر — لا يمكن إعادة التصدير.`
                    : monthExport ? `آخر تصدير v${monthExport.version} في ${new Date(monthExport.exported_at).toLocaleString('ar-IQ-u-nu-latn')} · ${monthExport.rows_count} موظفاً. إعادة التصدير تستبدل اللقطة لدى المالية ما لم تعتمدها.`
                    : 'يُرسَل الكشف المعتمد (أيام الحضور/الغياب/الإجازة + الاستقطاعات) إلى وحدة الرواتب في المالية كلقطة مرقّمة.'}
                  {!locked && !conf?.can_export && <span className="block font-bold text-amber-800">التصدير متوقف: أعد الاعتماد أولاً لتطبيق التغييرات المعلّقة.</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" isLoading={busyExcel} disabled={!grid.length} onClick={() => void doExcel('approved')} data-testid="att-excel-approved"><Icon name="file-spreadsheet" size={14} /> Excel الكشف المعتمد</Button>
                  <Button size="sm" isLoading={exportMonth.isPending} disabled={locked || !conf?.can_export} onClick={() => void doExport()} data-testid="ops-export-month" title={locked ? 'الشهر مقفل بعد اعتماد المالية' : !conf?.can_export ? 'أعد الاعتماد أولاً' : ''}>
                    <Icon name="send" size={14} /> {locked ? '🔒 الشهر مقفل' : monthExport ? 'إعادة تصدير بيانات الشهر إلى المالية' : 'تصدير بيانات الشهر إلى المالية'}
                  </Button>
                </div>
              </div>
            </SectionCard>
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3" data-testid="att-approved-filters">
              <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="app-branch"><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="app-dept"><option value="">كل الأقسام (بفروعها)</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.parent_id ? '↳ ' : ''}{d.name}</option>)}</select>
              <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="app-search" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="att-approved-stats">
              <StatCard title="الموظفون" value={gridTotals.emp} tone="slate" testId="app-emp" />
              <StatCard title="أيام الحضور" value={gridTotals.present} tone="emerald" testId="app-present" />
              <StatCard title="أيام الغياب" value={gridTotals.absent} tone="red" testId="app-absent" />
              <StatCard title="أيام الإجازة" value={gridTotals.leave} tone="sky" testId="app-leave" />
              <StatCard title="ساعات العمل" value={fmtHM(gridTotals.minutes)} tone="violet" testId="app-hours" />
            </div>
            <GridLegend mode="approved" />
            {gridLoading ? <LoadingSpinner /> : grid.length === 0 ? <EmptyState title="لا موظفين في هذا النطاق" hint="وسّع الفلاتر" /> : <MonthGrid rows={grid} mode="approved" />}
          </>
        )
      )}

      {editing && <EditPanel row={editing} onClose={() => setEditing(null)} />}
      {auditFor && <AuditPanel row={auditFor} onClose={() => setAuditFor(null)} />}
      {deductFor && <DeductPanel row={deductFor} month={month} onClose={() => setDeductFor(null)} />}
      {confirmOpen && (
        <Overlay title={`اعتماد حضورية ${month.slice(0, 7)}`} onClose={() => setConfirmOpen(false)} testId="att-confirm-dialog">
          {gridLoading ? <LoadingSpinner /> : (
            <div className="space-y-3 text-xs">
              <p className="text-slate-600">سيُحتسب الشهر كاملاً أولاً (كل الأيام الماضية بلا بصمة تُسجَّل غياباً)، ثم يُقفل التعديل التفصيلي ويُفتح «الكشف المعتمد» والتصدير إلى المالية. أي تعديل لاحق يحتاج إعادة فتح بسبب يُبلَّغ به التطوير المركزية.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard title="الموظفون" value={gridTotals.emp} testId="cf-emp" />
                <StatCard title="أيام حضور" value={gridTotals.present} tone="emerald" testId="cf-present" />
                <StatCard title="أيام غياب" value={gridTotals.absent} tone="red" testId="cf-absent" />
                <StatCard title="أيام إجازة" value={gridTotals.leave} tone="sky" testId="cf-leave" />
              </div>
              {(gridTotals.incomplete > 0 || gridTotals.unevaluated > 0) && (
                <ul className="list-inside list-disc rounded-xl border border-amber-200 bg-amber-50 p-2 text-amber-900" data-testid="cf-warnings">
                  {gridTotals.incomplete > 0 && <li><b>{gridTotals.incomplete}</b> بصمة ناقصة غير محسومة — ستظهر في الكشف المعتمد «حاضر» (راجعها من شبكة الشهر إن لزم).</li>}
                  {gridTotals.unevaluated > 0 && <li><b>{gridTotals.unevaluated}</b> يوم غير محتسب — سيُحتسب الآن عند الاعتماد.</li>}
                </ul>
              )}
              {gridTotals.manual > 0 && <p className="text-slate-500">{gridTotals.manual} يوم عدّلته غرفة العمليات بسبب موثّق.</p>}
              <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setConfirmOpen(false)}>إلغاء</Button><Button size="sm" isLoading={confirmMonth.isPending} onClick={() => void doConfirm()} data-testid="att-confirm-save">اعتماد الشهر</Button></div>
            </div>
          )}
        </Overlay>
      )}
      {reopenOpen && <ReopenPanel month={month} onClose={() => setReopenOpen(false)} onDone={() => { setReopenOpen(false); setStage('detailed') }} reopen={reopenMonth} />}
    </div>
  )
}

function ReopenPanel({ month, onClose, onDone, reopen }: { month: string; onClose: () => void; onDone: () => void; reopen: ReturnType<typeof useReopenAttendanceMonth> }) {
  const [reason, setReason] = useState(''); const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (reason.trim().length < 3) { setErr('السبب إلزامي (3 أحرف على الأقل)'); return }
    setErr(null)
    try { await reopen.mutateAsync({ month, reason: reason.trim() }); onDone() } catch { /* toast in hook */ }
  }
  return (
    <Overlay title={`إعادة فتح حضورية ${month.slice(0, 7)}`} onClose={onClose} testId="att-reopen-dialog">
      <Field id="ro-reason" label="سبب إعادة الفتح *"><textarea id="ro-reason" className={clsx(field, 'h-20 py-2')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: وصلت بصمة خروج متأخرة ليوم 12 — تصحيح قبل التصدير" data-testid="ro-reason" /></Field>
      <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800" data-testid="it-notify-notice-reopen">
        <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>سيتم تبليغ وحدة التطوير المركزية بهذا الإجراء تلقائياً (إشعار + قيد في سجل التدقيق باسمك والسبب). التغييرات التلقائية المعلّقة ستُطبَّق، ثم يلزم اعتماد الشهر من جديد قبل التصدير.</span>
      </p>
      {err && <p className="mt-2 text-xs font-bold text-red-600" role="alert" data-testid="ro-error">{err}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>إلغاء</Button><Button size="sm" onClick={() => void save()} isLoading={reopen.isPending} data-testid="ro-save">إعادة الفتح</Button></div>
    </Overlay>
  )
}

function Overlay({ title, onClose, children, testId }: { title: string; onClose: () => void; children: React.ReactNode; testId: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal="true" data-testid={testId}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">{title}</h3><button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="إغلاق">✕</button></div>
        {children}
      </div>
    </div>
  )
}

function EditPanel({ row, onClose }: { row: AttendanceDay; onClose: () => void }) {
  const edit = useEditAttendance(); const reset = useResetAttendance()
  const [err, setErr] = useState<string | null>(null)
  // الأوقات تُعرض وتُحفظ بتوقيت بغداد (+03:00 ثابت بلا توقيت صيفي) مهما كان توقيت جهاز المدقّق
  const toLocal = (ts: string | null) => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' }) : ''
  const [cin, setCin] = useState(toLocal(row.check_in)); const [cout, setCout] = useState(toLocal(row.check_out))
  const [st, setSt] = useState<AttendanceStatus>(row.status); const [reason, setReason] = useState('')
  const compose = (hm: string, dayOffset = 0) => { if (!hm) return null; const d = new Date(`${row.work_date}T${hm}:00+03:00`); d.setUTCDate(d.getUTCDate() + dayOffset); return d.toISOString() }
  const overnight = !!cin && !!cout && cout < cin
  const save = async () => {
    if (reason.trim().length < 3) { setErr('السبب إلزامي (3 أحرف على الأقل)'); return }
    setErr(null)
    try {
      await edit.mutateAsync({ employeeId: row.employee_id, date: row.work_date, checkIn: compose(cin), checkOut: compose(cout, overnight ? 1 : 0), status: st, reason: reason.trim() })
      onClose()
    } catch { /* toast in hook */ }
  }
  const doReset = async () => {
    if (reason.trim().length < 3) { setErr('السبب إلزامي لإعادة الاحتساب'); return }
    setErr(null)
    try { await reset.mutateAsync({ employeeId: row.employee_id, date: row.work_date, reason: reason.trim() }); onClose() } catch { /* toast in hook */ }
  }
  return (
    <Overlay title={`تعديل حضور ${row.full_name} — ${row.work_date}`} onClose={onClose} testId="ops-edit-panel">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="e-in" label="وقت الدخول"><input id="e-in" type="time" className={field} value={cin} onChange={(e) => setCin(e.target.value)} data-testid="e-in" /></Field>
        <Field id="e-out" label={`وقت الخروج${overnight ? ' (اليوم التالي)' : ''}`}><input id="e-out" type="time" className={field} value={cout} onChange={(e) => setCout(e.target.value)} data-testid="e-out" /></Field>
        <Field id="e-status" label="الحالة *" hint="التأخير/الخروج المبكر يُحسبان من الأوقات؛ حاضر/غائب/إجازة تصفّرهما"><select id="e-status" className={field} value={st} onChange={(e) => setSt(e.target.value as AttendanceStatus)} data-testid="e-status">{EDITABLE.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field id="e-reason" label="سبب التعديل *"><textarea id="e-reason" className={clsx(field, 'h-20 py-2')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: بصمة الخروج لم تُسجَّل بسبب عطل الجهاز — تم التأكد من مسؤول القسم" data-testid="e-reason" /></Field></div>
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800" data-testid="it-notify-notice">
        <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>سيتم تبليغ وحدة التطوير المركزية بهذا الإجراء تلقائياً (إشعار + قيد في سجل التدقيق باسمك والسبب).</span>
      </p>
      {err && <p className="mt-2 text-xs font-bold text-red-600" role="alert" data-testid="e-error">{err}</p>}
      <div className="mt-3 flex flex-wrap justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => void doReset()} isLoading={reset.isPending} data-testid="e-reset">إعادة الاحتساب من البصمات</Button>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={onClose}>إلغاء</Button><Button size="sm" onClick={() => void save()} isLoading={edit.isPending} data-testid="e-save">حفظ التعديل</Button></div>
      </div>
    </Overlay>
  )
}

function AuditPanel({ row, onClose }: { row: AttendanceDay; onClose: () => void }) {
  const { data: log = [], isLoading } = useAttendanceAudit({ employeeId: row.employee_id, from: row.work_date, to: row.work_date })
  const diff = (o: Record<string, unknown> | null, n: Record<string, unknown> | null) => {
    if (!o || !n) return []
    return Object.keys(n).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])).map((k) => `${k}: ${String(o[k] ?? '—')} → ${String(n[k] ?? '—')}`)
  }
  return (
    <Overlay title={`سجل التدقيق — ${row.full_name} ${row.work_date}`} onClose={onClose} testId="ops-audit-panel">
      {isLoading ? <LoadingSpinner /> : log.length === 0 ? <p className="text-xs text-slate-400">لا تعديلات على هذا اليوم</p> : (
        <ol className="max-h-80 space-y-2 overflow-y-auto text-xs" data-testid="audit-list">
          {log.map((a) => (
            <li key={a.id} className="rounded-xl bg-slate-50 p-2">
              <div className="flex justify-between"><span className="font-bold">{AUDIT_LABELS[a.action] ?? a.action}</span><span className="text-slate-500">{new Date(a.created_at).toLocaleString('ar-IQ-u-nu-latn')}</span></div>
              <p className="text-slate-600">{a.reason}</p><p className="text-[10px] text-slate-400" dir="ltr">{a.actor ? `actor ${a.actor.slice(0, 8)}` : ''}</p>
              <ul className="mt-1 text-[11px] text-slate-500" dir="ltr">{diff(a.before, a.after).map((d) => <li key={d}>{d}</li>)}</ul>
            </li>
          ))}
        </ol>
      )}
    </Overlay>
  )
}

function DeductPanel({ row, month, onClose }: { row: AttendanceDay; month: string; onClose: () => void }) {
  const add = useAddDeduction(); const [err, setErr] = useState<string | null>(null)
  const [kind, setKind] = useState<'amount' | 'days'>('days'); const [value, setValue] = useState(''); const [reason, setReason] = useState('')
  const save = async () => {
    const v = Number(value); if (!(v > 0)) { setErr('القيمة يجب أن تكون أكبر من صفر'); return }
    if (reason.trim().length < 3) { setErr('السبب إلزامي'); return }
    setErr(null)
    try { await add.mutateAsync({ employeeId: row.employee_id, month, amount: kind === 'amount' ? v : 0, days: kind === 'days' ? v : 0, reason: reason.trim() }); onClose() } catch { /* toast in hook */ }
  }
  return (
    <Overlay title={`استقطاع يدوي — ${row.full_name} (${month.slice(0, 7)})`} onClose={onClose} testId="ops-deduct-panel">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="d-kind" label="النوع"><select id="d-kind" className={field} value={kind} onChange={(e) => setKind(e.target.value as 'amount' | 'days')} data-testid="d-kind"><option value="days">أيام (تحسمها المالية بأجر اليوم)</option><option value="amount">مبلغ ثابت (د.ع)</option></select></Field>
        <Field id="d-value" label={kind === 'days' ? 'عدد الأيام' : 'المبلغ'}><input id="d-value" type="number" min={0} step={kind === 'days' ? 0.5 : 250} className={field} value={value} onChange={(e) => setValue(e.target.value)} data-testid="d-value" /></Field>
        <div className="sm:col-span-2"><Field id="d-reason" label="السبب *"><textarea id="d-reason" className={clsx(field, 'h-20 py-2')} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="d-reason" /></Field></div>
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800" data-testid="it-notify-notice-ded">
        <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>سيتم تبليغ وحدة التطوير المركزية بهذا الإجراء تلقائياً (إشعار + قيد في سجل التدقيق باسمك والسبب).</span>
      </p>
      {err && <p className="mt-2 text-xs font-bold text-red-600" role="alert" data-testid="d-error">{err}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>إلغاء</Button><Button size="sm" onClick={() => void save()} isLoading={add.isPending} data-testid="d-save">تسجيل الاستقطاع</Button></div>
    </Overlay>
  )
}

function DeductionsPanel({ month, locked }: { month: string; locked: boolean }) {
  const { data: rows = [], isLoading } = useDeductions(month); const del = useDeleteDeduction()
  if (isLoading) return <LoadingSpinner />
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="deductions-panel">
      <div className="flex items-center justify-between p-3"><h3 className="text-sm font-bold">الاستقطاعات (يدوية + كشوفات معتمدة) — {month.slice(0, 7)}</h3><span className="text-xs text-slate-500">{rows.length} استقطاعاً</span></div>
      {rows.length === 0 ? <p className="p-6 text-center text-xs text-slate-400">لا استقطاعات لهذا الشهر — تُضاف من زر «استقطاع» بجانب أي صف حضور</p> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-2 text-start">الموظف</th><th className="p-2">النوع</th><th className="p-2">القيمة</th><th className="p-2 text-start">السبب</th><th className="p-2">التاريخ</th><th className="p-2"></th></tr></thead>
          <tbody>{rows.map((d) => (
            <tr key={d.id} className="border-t border-slate-100" data-testid={`ded-row-${d.id}`}>
              <td className="p-2"><p className="font-semibold">{d.employees?.full_name ?? '—'}</p><p className="text-[11px] text-slate-500">{d.employees?.employee_number}</p></td>
              <td className="p-2 text-center text-xs">{d.days > 0 ? 'أيام' : 'مبلغ'}</td>
              <td className="p-2 text-center font-bold tabular-nums">{d.days > 0 ? `${d.days} يوم` : fmtMoney(d.amount)}</td>
              <td className="p-2 text-xs">{d.reason}{d.source_disclosure_id && <a href={`/ops-room/disclosures?tab=archive&id=${d.source_disclosure_id}`} className="ms-1 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 hover:bg-violet-200" data-testid={`ded-src-${d.id}`}>كشف {d.disclosure?.ref_no ?? ''}</a>}</td>
              <td className="p-2 text-center text-xs">{new Date(d.created_at).toLocaleDateString('ar-IQ-u-nu-latn')}</td>
              <td className="p-2 text-center">{d.source_disclosure_id ? <span className="text-[10px] text-slate-400" title="استقطاع ناتج عن كشف معتمد — يُدار من وحدة الكشوفات" data-testid={`ded-locked-${d.id}`}>من كشف معتمد</span> : !locked && <button type="button" className="text-[11px] text-red-600 hover:underline" onClick={async () => { const reason = window.prompt('سبب حذف الاستقطاع:'); if (!reason || reason.trim().length < 3) return; try { await del.mutateAsync({ id: d.id, reason: reason.trim() }) } catch { /* toast in hook */ } }} data-testid={`ded-del-${d.id}`}>حذف</button>}</td>
            </tr>))}</tbody>
        </table>
      )}
    </div>
  )
}

function ExportsPanel() {
  const { data: rows = [], isLoading } = useMonthExports()
  if (isLoading) return <LoadingSpinner />
  const label: Record<string, string> = { exported: 'مُرسل للمالية', approved: 'معتمد ومقفل', superseded: 'استُبدل بتصدير أحدث' }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="exports-panel">
      {rows.length === 0 ? <p className="p-6 text-center text-xs text-slate-400">لم يُصدَّر أي شهر بعد</p> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-2">الشهر</th><th className="p-2">الإصدار</th><th className="p-2">الموظفون</th><th className="p-2">الحالة</th><th className="p-2">التاريخ</th><th className="p-2">اعتماد المالية</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id} className="border-t border-slate-100 text-center text-xs" data-testid={`exp-row-${x.period_month}-${x.version}`}>
              <td className="p-2 font-bold">{x.period_month.slice(0, 7)}</td><td className="p-2">v{x.version}</td><td className="p-2">{x.rows_count}</td>
              <td className="p-2"><span className={clsx('rounded-full px-2 py-0.5 font-bold', x.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : x.status === 'exported' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500')}>{label[x.status] ?? x.status}</span></td>
              <td className="p-2">{new Date(x.exported_at).toLocaleString('ar-IQ-u-nu-latn')}</td>
              <td className="p-2">{x.approved_at ? new Date(x.approved_at).toLocaleString('ar-IQ-u-nu-latn') : '—'}</td>
            </tr>))}</tbody>
        </table>
      )}
    </div>
  )
}
