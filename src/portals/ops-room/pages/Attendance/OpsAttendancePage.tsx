/**
 * غرفة العمليات — وحدة «الحضوريات»
 * تدقيق حضور كل الأقسام: فلاتر فرع→قسم (بشجرته)→يوم/شهر→حالة→بحث · تعديل أي صف (دخول/خروج/حالة) بسبب إلزامي + سجل تدقيق كامل
 * · استقطاعات يدوية شهرية لكل موظف (مبلغ أو أيام + سبب) · «تصدير بيانات الشهر» لقطة مقفلة إلى المالية (يُعاد التصدير حتى اعتماد الراتب).
 */
import { useMemo, useState } from 'react'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, WEEKDAYS_AR,
  useAddDeduction, useAttendance, useAttendanceAudit, useDeductions, useDeleteDeduction, useEditAttendance, useEvaluateAttendance, useExportMonth, useMonthExportStatus, useMonthExports, useResetAttendance, useWaiveDeduction,
} from '@features/hr'
import type { AttendanceDayRow as AttendanceDay, AttendanceStatus } from '@features/hr'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { Field, MonthPicker, StatCard, StatusBadge } from '@portals/hr/components/hr-ui'
import { field, fmtMinutes, fmtMoney, fmtTime, isoDay, monthStart, proposedLabel } from '@portals/hr/components/hr-format'
import { UnmatchedPunchesPanel } from '@portals/hr/components/UnmatchedPunchesPanel'

type Mode = 'day' | 'month'
const AUDIT_LABELS: Record<string, string> = { edit: 'تعديل', reset_auto: 'إعادة احتساب', deduction_add: 'إضافة استقطاع', deduction_delete: 'حذف استقطاع', export: 'تصدير شهر', approve: 'اعتماد المالية', waive: 'إلغاء استقطاع مقترح', unwaive: 'إعادة استقطاع مقترح' }
const EDITABLE: AttendanceStatus[] = ['present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit']

export default function OpsAttendancePage() {
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
  const [panel, setPanel] = useState<'rows' | 'deductions' | 'exports'>('rows')
  const waive = useWaiveDeduction()

  const { data: departments = [] } = useDepartments()
  const { data: branches = [] } = useBranches()
  const range = useMemo(() => mode === 'day' ? { from: day, to: day } : { from: month, to: isoDay(new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0)) }, [mode, day, month])
  const { data: rows = [], isLoading } = useAttendance({ ...range, branchId: branchId || null, departmentId: departmentId || null, status: status || null, search })
  const evaluate = useEvaluateAttendance()
  const exportMonth = useExportMonth()
  const { data: exports = [] } = useMonthExports()
  const monthExport = exports.find((x) => x.period_month === month)
  const { data: exportStatus } = useMonthExportStatus(month)
  const counts = useMemo(() => Object.fromEntries(ATTENDANCE_STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<AttendanceStatus, number>, [rows])
  const locked = monthExport?.status === 'approved'
  const proposedTotals = useMemo(() => rows.reduce((a, r) => {
    if (r.deduction_waived) { a.waived += 1; return a }
    const m = r.proposed_deduction_minutes ?? 0, d = r.proposed_deduction_days ?? 0
    a.minutes += m; a.days += d; if (m > 0 || d > 0) a.count += 1; return a
  }, { minutes: 0, days: 0, count: 0, waived: 0 }), [rows])
  const toggleWaive = async (r: AttendanceDay) => {
    const reason = window.prompt((r.deduction_waived ? 'سبب إعادة الاستقطاع المقترح:' : 'سبب إلغاء الاستقطاع المقترح (إلزامي):') + '\nسيتم تبليغ وحدة التطوير المركزية بهذا الإجراء.')
    if (!reason || reason.trim().length < 3) return
    try { await waive.mutateAsync({ employeeId: r.employee_id, date: r.work_date, waive: !r.deduction_waived, reason: reason.trim() }) } catch { /* toast in hook */ }
  }

  const doExport = async () => {
    if (locked) return
    if (!window.confirm(monthExport ? 'يوجد تصدير سابق لهذا الشهر لم تعتمده المالية بعد — سيُستبدل بلقطة جديدة. متابعة؟' : 'سيُنشأ ملف شهري مقفل يُرسل إلى المالية. متابعة؟')) return
    try { await exportMonth.mutateAsync(month) } catch { /* toast in hook */ }
  }

  return (
    <div className="space-y-4" data-testid="ops-attendance">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-black">الحضوريات</h1><p className="text-xs text-slate-500">تدقيق حضور كل الأقسام · كل تعديل يتطلب سبباً ويُسجَّل باسم المدقق</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" isLoading={evaluate.isPending} onClick={() => evaluate.mutate(range)} data-testid="ops-evaluate"><Icon name="refresh" size={14} /> إعادة الاحتساب</Button>
          <Button size="sm" isLoading={exportMonth.isPending} disabled={locked} onClick={() => void doExport()} data-testid="ops-export-month" title={locked ? 'الشهر مقفل بعد اعتماد المالية' : ''}>
            {locked ? '🔒 الشهر مقفل' : monthExport ? 'إعادة تصدير بيانات الشهر' : 'تصدير بيانات الشهر إلى المالية'}
          </Button>
        </div>
      </header>

      {exportStatus?.needs_reexport && !locked && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="status" data-testid="ops-reexport-banner">
          <Icon name="alert-triangle" size={16} />
          <span><b>يلزم إعادة تصدير شهر {month.slice(0, 7)}:</b> حدثت {exportStatus.changes_after} تغييرات بعد آخر تصدير (الإصدار v{exportStatus.version}){exportStatus.deductions_after > 0 ? ` منها ${exportStatus.deductions_after} استقطاعات` : ''}{exportStatus.disclosure_deductions_after > 0 ? ` (${exportStatus.disclosure_deductions_after} من كشوفات معتمدة)` : ''} — كشف المالية الحالي لا يتضمنها.</span>
          <Button size="sm" className="ms-auto" isLoading={exportMonth.isPending} onClick={() => void doExport()} data-testid="ops-reexport-now">إعادة التصدير الآن</Button>
        </div>
      )}
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6" data-testid="ops-filters">
        <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
          <button type="button" onClick={() => setMode('day')} className={clsx('flex-1 rounded-lg py-1.5', mode === 'day' && 'bg-white shadow')} data-testid="mode-day">يوم</button>
          <button type="button" onClick={() => setMode('month')} className={clsx('flex-1 rounded-lg py-1.5', mode === 'month' && 'bg-white shadow')} data-testid="mode-month">شهر</button>
        </div>
        {mode === 'day' ? <input type="date" className={field} value={day} onChange={(e) => setDay(e.target.value)} data-testid="ops-day" /> : <MonthPicker value={month} onChange={setMonth} />}
        <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="ops-branch"><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="ops-dept"><option value="">كل الأقسام (بفروعها)</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.parent_id ? '↳ ' : ''}{d.name}</option>)}</select>
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus | '')} data-testid="ops-status"><option value="">كل الحالات</option>{ATTENDANCE_STATUS_ORDER.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}</select>
        <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ops-search" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {ATTENDANCE_STATUS_ORDER.map((s) => (
          <button key={s} type="button" onClick={() => setStatus(status === s ? '' : s)} className={clsx('text-start', status === s && 'rounded-2xl ring-2 ring-brand-400')} data-testid={`ops-stat-${s}`}>
            <StatCard title={ATTENDANCE_STATUS_LABELS[s]} value={counts[s]} tone={s === 'absent' ? 'red' : s === 'late' ? 'amber' : s === 'present' ? 'emerald' : s === 'incomplete' ? 'violet' : 'sky'} />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="ops-proposed-summary">
        <StatCard title="أيام حضور بها استقطاع مقترح" value={proposedTotals.count} tone="amber" testId="ops-proposed-count" />
        <StatCard title="دقائق مقترحة (غير ملغاة)" value={fmtMinutes(proposedTotals.minutes)} tone="amber" testId="ops-proposed-minutes" />
        <StatCard title="أيام مقترحة (غير ملغاة)" value={proposedTotals.days} tone="red" testId="ops-proposed-days" />
        <StatCard title="استقطاعات ألغتها غرفة العمليات" value={proposedTotals.waived} tone="emerald" testId="ops-proposed-waived" hint="بسبب موثّق في سجل التدقيق" />
      </div>

      <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
        {([['rows', 'سجلات الحضور'], ['deductions', 'الاستقطاعات'], ['exports', 'تصديرات الأشهر']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setPanel(k)} className={clsx('rounded-lg px-3 py-1.5', panel === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} data-testid={`panel-${k}`}>{l}</button>)}
      </nav>

      {panel === 'rows' && <UnmatchedPunchesPanel from={range.from} to={range.to} />}
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
                        {!locked && <button type="button" className="mt-0.5 text-[10px] font-bold text-brand-700 hover:underline" onClick={() => void toggleWaive(r)} data-testid={`ops-waive-${r.employee_number}-${r.work_date}`}>{r.deduction_waived ? 'إعادة الاستقطاع' : 'إلغاء بسبب'}</button>}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="p-2 text-center"><StatusBadge status={r.status} source={r.source} />{r.edit_reason && <p className="mt-0.5 max-w-[10rem] truncate text-[10px] text-slate-500" title={r.edit_reason}>{r.edit_reason}</p>}</td>
                  <td className="p-2">
                    <div className="flex justify-center gap-1">
                      <button type="button" className="rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-700" onClick={() => setEditing(r)} disabled={locked} data-testid={`ops-edit-${r.employee_number}-${r.work_date}`}>تعديل</button>
                      <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700" onClick={() => setDeductFor(r)} disabled={locked} data-testid={`ops-deduct-${r.employee_number}`}>استقطاع</button>
                      <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700" onClick={() => setAuditFor(r)} data-testid={`ops-audit-${r.employee_number}-${r.work_date}`}>السجل</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {panel === 'deductions' && <DeductionsPanel month={month} locked={locked} />}
      {panel === 'exports' && <ExportsPanel />}

      {editing && <EditPanel row={editing} onClose={() => setEditing(null)} />}
      {auditFor && <AuditPanel row={auditFor} onClose={() => setAuditFor(null)} />}
      {deductFor && <DeductPanel row={deductFor} month={month} onClose={() => setDeductFor(null)} />}
    </div>
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
