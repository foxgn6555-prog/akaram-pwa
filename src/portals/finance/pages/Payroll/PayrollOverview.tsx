/**
 * بوابة الشؤون المالية — وحدة «الرواتب»
 * ① كشف الشهر المستلم من غرفة العمليات (أيام/تأخير/استقطاعات) + الصافي المقترح، تعديل صف بسبب، اعتماد يقفل الشهر، تصدير Excel.
 * ② ملفات الرواتب (المالية فقط): نوع التعاقد، الأساسي/أجر اليوم، المخصصات، الاستقطاعات الثابتة.
 * ③ إشعارات الموارد البشرية: رواتب بانتظار التعريف + تسويات نهاية الخدمة.
 */
import { Fragment, useMemo, useState } from 'react'
import { ATTENDANCE_STATUS_LABELS, CONTRACT_LABELS, TERMINATION_LABELS, useAdjustPayroll, useApprovePayroll, useEmployeeMonthDays, useEmployeeMonthDeductions, useFinanceNotices, useHrEmployees, useMarkNoticeDone, useMonthExportStatus, usePayrollSheet, useSalaryProfile, useSetSalary } from '@features/hr'
import type { ContractType, PayrollSheetRow, TerminationType } from '@features/hr'
import { downloadPayrollExcel, groupByDepartment, rowDeductions, rowGross } from '@features/hr/lib/payrollExcel'
import { hr as hrSdk } from '@sdk/hr.sdk'
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
      {tab === 'sheet' && <SheetTab />}
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'notices' && <NoticesTab onDefine={() => setTab('profiles')} />}
    </div>
  )
}

// ── كشف الشهر ──
function SheetTab() {
  const [month, setMonth] = useState(monthStart())
  const [search, setSearch] = useState('')
  const { data: rows = [], isLoading } = usePayrollSheet(month)
  const { data: exportStatus } = useMonthExportStatus(month)
  const approve = useApprovePayroll()
  const [editing, setEditing] = useState<PayrollSheetRow | null>(null)
  const [details, setDetails] = useState<PayrollSheetRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const shown = useMemo(() => rows.filter((r) => !search || (r.full_name ?? '').includes(search) || (r.employee_number ?? '').includes(search) || (r.department_name ?? '').includes(search)), [rows, search])
  const groups = useMemo(() => groupByDepartment(shown), [shown])
  const head = rows[0]
  const approved = head?.export_status === 'approved'
  const missing = rows.filter((r) => r.pay_type == null).length
  const unevaluated = rows.reduce((s, r) => s + (r.unevaluated_days ?? 0), 0)
  const totals = useMemo(() => ({ proposed: rows.reduce((s, r) => s + (r.proposed_net ?? 0), 0), final: rows.reduce((s, r) => s + (r.final_net ?? r.proposed_net ?? 0), 0), ops: rows.reduce((s, r) => s + r.ops_deduction_amount + (r.ops_deduction_days_amount ?? 0), 0), auto: rows.reduce((s, r) => s + (r.auto_deduction_amount ?? 0), 0), gross: rows.reduce((s, r) => s + rowGross(r), 0), deductions: rows.reduce((s, r) => s + rowDeductions(r), 0) }), [rows])

  const doApprove = async () => {
    if (!head) return
    if (missing > 0 && !window.confirm(`${missing} موظفاً بلا ملف راتب مُعرَّف — سيُعتمد صافيهم صفراً. متابعة؟`)) return
    const stale = !!exportStatus?.needs_reexport
    if (stale && !window.confirm(`تنبيه: حدثت ${exportStatus?.changes_after ?? 0} تغييرات في الحضورية بعد هذا التصدير${(exportStatus?.disclosure_deductions_after ?? 0) > 0 ? ` (منها ${exportStatus?.disclosure_deductions_after} استقطاعات كشوفات معتمدة)` : ''} وهي غير مشمولة في هذا الكشف.\nالأفضل الطلب من غرفة العمليات إعادة التصدير. هل تريد الاعتماد رغم ذلك؟`)) return
    if (!window.confirm('اعتماد الكشف يقفل الشهر نهائياً ولا يمكن لغرفة العمليات إعادة تصديره. تأكيد الاعتماد؟')) return
    try { await approve.mutateAsync({ exportId: head.export_id, force: stale }) } catch { /* toast in hook */ }
  }
  const doExport = async () => {
    setExporting(true)
    try {
      const deductions = await hrSdk.listDeductions(month).catch(() => [])
      await downloadPayrollExcel(month, rows, deductions)
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-3" data-testid="sheet-tab">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <MonthPicker value={month} onChange={setMonth} />
        <input className={clsx(field, 'max-w-xs')} placeholder="بحث: اسم / رقم / قسم" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ps-search" />
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void doExport()} isLoading={exporting} disabled={rows.length === 0} data-testid="ps-excel">تصدير Excel</Button>
          <Button size="sm" onClick={() => void doApprove()} isLoading={approve.isPending} disabled={!head || approved} data-testid="ps-approve">{approved ? '✓ معتمد ومقفل' : 'اعتماد الكشف وقفل الشهر'}</Button>
        </div>
      </div>
      {head && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-8">
          <StatCard title="الموظفون في الكشف" value={rows.length} testId="ps-count" />
          <StatCard title="الإجمالي قبل الاستقطاع" value={fmtMoney(totals.gross)} tone="slate" hint="الأساسي + المخصصات (اليومي: الأيام المدفوعة × أجر اليوم)" testId="ps-gross" />
          <StatCard title="إجمالي الاستقطاعات" value={fmtMoney(totals.deductions)} tone="red" hint="ثابتة + عمليات + تلقائي" testId="ps-deductions" />
          <StatCard title="إجمالي الصافي المقترح" value={fmtMoney(totals.proposed)} tone="sky" testId="ps-proposed" />
          <StatCard title="إجمالي الصافي المعتمد" value={fmtMoney(totals.final)} tone="emerald" testId="ps-final" />
          <StatCard title="استقطاعات غرفة العمليات" value={fmtMoney(totals.ops)} tone="amber" testId="ps-ops" />
          <StatCard title="استقطاع تلقائي (نقص/غياب)" value={fmtMoney(totals.auto)} tone="red" hint="محسوب من الشرائح بعد تدقيق غرفة العمليات" testId="ps-auto" />
          <StatCard title="بلا ملف راتب" value={missing} tone={missing ? 'red' : 'slate'} hint={missing ? 'عرّف رواتبهم من تبويب ملفات الرواتب' : ''} testId="ps-missing" />
        </div>
      )}
      {head && !approved && unevaluated > 0 && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900" role="status" data-testid="ps-unevaluated-banner">
          <b>تحذير:</b> هذا الكشف يحتوي {unevaluated} يوم عمل غير محتسب (أيام بلا بصمة لم يُسجَّل غيابها) — الصافي فيه أعلى من الصحيح. اطلب من غرفة العمليات «إعادة تصدير بيانات الشهر» (التصدير يحتسب الشهر كاملاً تلقائياً).
        </div>
      )}
      {head && !approved && exportStatus?.needs_reexport && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="status" data-testid="ps-stale-banner">
          <span className="text-base">⚠</span>
          <span><b>هذا الكشف قديم:</b> حدثت {exportStatus.changes_after} تغييرات في الحضورية بعد تصديره{exportStatus.deductions_after > 0 ? ` منها ${exportStatus.deductions_after} استقطاعات` : ''}{exportStatus.disclosure_deductions_after > 0 ? ` (${exportStatus.disclosure_deductions_after} من كشوفات معتمدة)` : ''} — اطلب من غرفة العمليات «إعادة تصدير بيانات الشهر» قبل الاعتماد.</span>
        </div>
      )}
      {head && <p className="text-[11px] text-slate-500" data-testid="ps-meta">الإصدار v{head.export_version} · مُستلم من غرفة العمليات {new Date(head.exported_at).toLocaleString('ar-IQ-u-nu-latn')} · {approved ? <span className="font-bold text-emerald-700">معتمد ومقفل</span> : <span className="font-bold text-sky-700">بانتظار الاعتماد — قد تعيد غرفة العمليات التصدير</span>}</p>}

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لم تُصدّر غرفة العمليات بيانات هذا الشهر بعد" hint="يظهر الكشف هنا فور الضغط على «تصدير بيانات الشهر» في وحدة الحضوريات" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-xs" data-testid="ps-table">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="p-2 text-start">الموظف</th><th className="p-2">التعاقد</th><th className="p-2" title="الأيام المجدولة في الشهر / المحتسبة منها">مجدول / محتسب</th><th className="p-2">حاضر</th><th className="p-2">غائب</th><th className="p-2" title="مدفوعة / غير مدفوعة">إجازة م/غ</th><th className="p-2">ناقص</th><th className="p-2">تأخير (د)</th><th className="p-2">الأساسي / اليومي</th><th className="p-2">مخصصات</th><th className="p-2">الإجمالي</th><th className="p-2">استقطاعات ثابتة</th><th className="p-2">استقطاع العمليات</th><th className="p-2">استقطاع تلقائي</th><th className="p-2">إجمالي الاستقطاعات</th><th className="p-2">الصافي المقترح</th><th className="p-2">الصافي المعتمد</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.name}>
                  <tr className="bg-slate-100/80" data-testid={`ps-group-${g.name}`}>
                    <td className="p-2 text-xs font-black text-slate-700" colSpan={18}>{g.name} <span className="font-normal text-slate-500">· {g.rows.length} موظفاً</span></td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.row_id} className={clsx('border-t border-slate-100', r.pay_type == null && 'bg-amber-50/50')} data-testid={`ps-row-${r.employee_number}`}>
                      <td className="p-2"><p className="text-sm font-semibold">{r.full_name}</p><p className="text-[10px] text-slate-500">{r.employee_number}{r.job_title ? ` · ${r.job_title}` : ''}</p></td>
                      <td className="p-2 text-center">{r.pay_type ? CONTRACT_LABELS[r.pay_type] : <span className="font-bold text-amber-700">غير مُعرَّف</span>}</td>
                      <td className="p-2 text-center tabular-nums" data-testid={`ps-days-count-${r.employee_number}`}>{r.scheduled_days != null ? `${r.scheduled_days} / ${r.working_days}` : r.working_days}{r.covered_days != null && r.days_in_month != null && r.covered_days < r.days_in_month && r.pay_type === 'monthly' && <span className="block rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800" title="الراتب الشهري محتسب بالنسبة والتناسب للفترة المشمولة فقط">مشمول {r.covered_days}/{r.days_in_month}</span>}{(r.unevaluated_days ?? 0) > 0 && <span className="block rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700" title="أيام مجدولة بلا احتساب — اطلب من غرفة العمليات إعادة التصدير">{r.unevaluated_days} غير محتسب</span>}</td><td className="p-2 text-center font-bold tabular-nums text-emerald-700">{r.days_present}</td><td className="p-2 text-center tabular-nums text-red-700">{r.days_absent}</td><td className="p-2 text-center tabular-nums" data-testid={`ps-leave-${r.employee_number}`}>{r.days_leave_paid ?? r.days_leave}{(r.days_leave_unpaid ?? 0) > 0 && <span className="text-red-700"> / {r.days_leave_unpaid}</span>}</td><td className="p-2 text-center tabular-nums">{r.days_incomplete}</td><td className="p-2 text-center tabular-nums">{r.late_minutes}</td>
                      <td className="p-2 text-center tabular-nums">{r.pay_type === 'daily' ? <>{fmtMoney(r.daily_rate)}<span className="block text-[10px] text-slate-500">× {r.payable_days ?? r.days_present + (r.days_leave_paid ?? 0)} يوم مدفوع</span></> : fmtMoney(r.base_salary)}</td>
                      <td className="p-2 text-center tabular-nums">{fmtMoney(r.allowances_total)}</td>
                      <td className="p-2 text-center font-bold tabular-nums" data-testid={`ps-gross-${r.employee_number}`}>{r.pay_type == null ? '—' : fmtMoney(rowGross(r))}</td>
                      <td className="p-2 text-center tabular-nums">{fmtMoney(r.fixed_deductions_total)}</td>
                      <td className="p-2 text-center tabular-nums text-amber-700" title={r.ops_deduction_reasons ?? ''}>{fmtMoney(r.ops_deduction_amount + (r.ops_deduction_days_amount ?? 0))}{r.ops_deduction_days > 0 && <span className="block text-[10px]">منها {r.ops_deduction_days} يوم{r.ops_deduction_days_amount != null ? ` = ${fmtMoney(r.ops_deduction_days_amount)}` : ''}</span>}{r.ops_deduction_reasons && <span className="block max-w-[10rem] truncate text-[10px] font-normal text-slate-500">{r.ops_deduction_reasons}</span>}</td>
                      <td className="p-2 text-center tabular-nums text-red-700" data-testid={`ps-auto-${r.employee_number}`}>{fmtMoney(r.auto_deduction_amount ?? 0)}{(r.auto_deduction_days > 0 || r.auto_deduction_minutes > 0) && <span className="block text-[10px]">{r.auto_deduction_days > 0 ? `${r.auto_deduction_days} يوم` : ''}{r.auto_deduction_days > 0 && r.auto_deduction_minutes > 0 ? ' + ' : ''}{r.auto_deduction_minutes > 0 ? `${r.auto_deduction_minutes} د` : ''}</span>}{r.pay_type === 'daily' && (r.auto_absence_days ?? 0) > 0 && <span className="block text-[10px] font-normal text-slate-500">أيام الغياب غير مدفوعة أصلاً — لا تُخصم مرتين</span>}</td>
                      <td className="p-2 text-center font-bold tabular-nums text-red-700" data-testid={`ps-ded-${r.employee_number}`}>{r.pay_type == null ? '—' : fmtMoney(rowDeductions(r))}</td>
                      <td className="p-2 text-center font-bold tabular-nums">{fmtMoney(r.proposed_net)}</td>
                      <td className={clsx('p-2 text-center font-black tabular-nums', r.final_net != null && r.final_net !== r.proposed_net && 'text-amber-700')} title={r.finance_note ?? ''}>{fmtMoney(r.final_net ?? r.proposed_net)}{r.finance_note && <span className="block max-w-[8rem] truncate text-[10px] font-normal text-slate-500">{r.finance_note}</span>}</td>
                      <td className="whitespace-nowrap p-2 text-center">
                        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-700" onClick={() => setDetails(r)} data-testid={`ps-days-${r.employee_number}`}>الأيام</button>
                        {!approved && <button type="button" className="ms-1 rounded-lg bg-brand-50 px-2 py-1 font-bold text-brand-700" onClick={() => setEditing(r)} data-testid={`ps-edit-${r.employee_number}`}>تعديل</button>}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50 text-[11px] font-bold" data-testid={`ps-subtotal-${g.name}`}>
                    <td className="p-2" colSpan={3}>مجموع {g.name}</td>
                    <td className="p-2 text-center tabular-nums text-emerald-700">{g.present}</td><td className="p-2 text-center tabular-nums text-red-700">{g.absent}</td><td className="p-2" colSpan={5}></td>
                    <td className="p-2 text-center tabular-nums">{fmtMoney(g.gross)}</td><td className="p-2"></td>
                    <td className="p-2 text-center tabular-nums text-amber-700">{fmtMoney(g.ops)}</td><td className="p-2 text-center tabular-nums text-red-700">{fmtMoney(g.auto)}</td><td className="p-2 text-center tabular-nums text-red-700">{fmtMoney(g.deductions)}</td>
                    <td className="p-2 text-center tabular-nums">{fmtMoney(g.proposed)}</td><td className="p-2 text-center tabular-nums">{fmtMoney(g.final)}</td><td></td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <AdjustPanel row={editing} onClose={() => setEditing(null)} />}
      {details && <DaysPanel row={details} month={month} onClose={() => setDetails(null)} />}
    </div>
  )
}

/** 00186 — كيف حُسب الصافي؟ معادلة مكتوبة بالأرقام حتى يراجعها المحاسب */
function FormulaBox({ row: r }: { row: PayrollSheetRow }) {
  const daily = r.pay_type === 'daily'
  const basisDays = r.day_rate != null && r.base_salary ? Math.round((r.base_salary / r.day_rate) * 100) / 100 : 30
  const dayRate = daily ? (r.daily_rate ?? 0) : r.day_rate != null ? Number(r.day_rate) : Math.round(((r.base_salary ?? 0) / 30) * 10000) / 10000
  const partial = !daily && r.covered_days != null && r.days_in_month != null && r.covered_days < r.days_in_month && (r.proration_ratio ?? 1) < 1
  const baseDue = partial ? Math.min(r.base_salary ?? 0, Math.round(dayRate * (r.covered_days ?? 0) * 100) / 100) : (r.base_salary ?? 0)
  const minuteRate = Math.round((dayRate / Math.max(r.shift_minutes ?? 480, 1)) * 10000) / 10000
  const payable = r.payable_days ?? r.days_present + (r.days_leave_paid ?? 0)
  const autoDays = daily ? (r.auto_shortfall_days ?? 0) : (r.auto_deduction_days ?? 0)
  const gross = rowGross(r), ded = rowDeductions(r)
  const dec = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] leading-5 text-slate-700" data-testid="ps-formula">
      <p className="font-bold text-slate-800">كيف حُسب الصافي؟</p>
      <p>أجر اليوم = {daily ? `أجر اليوم ${fmtMoney(dayRate)}` : `${fmtMoney(r.base_salary)} ÷ ${basisDays} = ${dec(dayRate)}`} · أجر الدقيقة = {dec(dayRate)} ÷ {r.shift_minutes ?? 480} دقيقة = {dec(minuteRate)}</p>
      <p>الإجمالي = {daily ? `${payable} يوم مدفوع (حاضر ${r.days_present} + إجازة مدفوعة ${r.days_leave_paid ?? 0}) × ${fmtMoney(r.daily_rate)}` : partial ? `الفترة المشمولة ${r.covered_days} من ${r.days_in_month} يوم (${r.period_from} → ${r.period_to}) × أجر اليوم ${dec(dayRate)} = ${dec(baseDue)}` : `الأساسي ${fmtMoney(r.base_salary)} (شهر مكتمل)`} + مخصصات {fmtMoney(r.allowances_total)}{partial ? ' (متناسبة)' : ''} = <b>{fmtMoney(gross)}</b>{partial && <span className="ms-1 rounded bg-sky-100 px-1 font-bold text-sky-800" data-testid="ps-prorated">راتب جزئي بالنسبة والتناسب</span>}</p>
      <p>الاستقطاعات = ثابتة {fmtMoney(r.fixed_deductions_total)} + عمليات {fmtMoney(r.ops_deduction_amount)}{r.ops_deduction_days > 0 ? ` + ${r.ops_deduction_days} يوم عمليات (${fmtMoney(r.ops_deduction_days_amount ?? r.ops_deduction_days * dayRate)})` : ''} + تلقائي ({r.auto_deduction_minutes ?? 0} دقيقة{autoDays > 0 ? ` + ${autoDays} يوم` : ''}{daily && (r.auto_absence_days ?? 0) > 0 ? ` — أيام الغياب ${r.auto_absence_days} غير مدفوعة أصلاً فلا تُخصم` : ''}) = {fmtMoney(r.auto_deduction_amount)}{r.auto_deduction_capped && <span className="ms-1 font-bold text-amber-700" data-testid="ps-auto-capped">(قُيّد بسقف الاستقطاع التلقائي من سياسة التطوير المركزية)</span>} ⇒ <b>{fmtMoney(ded)}</b></p>
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

// ── ملفات الرواتب ──
function ProfilesTab() {
  const [search, setSearch] = useState(''); const [onlyPending, setOnlyPending] = useState(false)
  const { data: employees = [], isLoading } = useHrEmployees({ search, status: 'active' })
  const [sel, setSel] = useState<string | null>(null)
  const list = employees.filter((e) => !onlyPending || e.salary_status !== 'defined')
  const selected = employees.find((e) => e.id === sel) ?? null
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]" data-testid="profiles-tab">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <input className={clsx(field, 'flex-1')} placeholder="بحث عن موظف" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="pr-search" />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} data-testid="pr-only-pending" /> بانتظار التعريف فقط</label>
        </div>
        {isLoading ? <LoadingSpinner /> : (
          <ul className="max-h-[32rem] divide-y overflow-y-auto text-sm">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setSel(e.id)} className={clsx('flex w-full items-center justify-between px-3 py-2 text-start hover:bg-slate-50', sel === e.id && 'bg-brand-50')} data-testid={`pr-emp-${e.employee_number}`}>
                  <span><span className="font-semibold">{e.full_name}</span><span className="block text-[11px] text-slate-500">{e.employee_number} · {e.department_name ?? '—'} · {CONTRACT_LABELS[e.contract_type]}</span></span>
                  <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', e.salary_status === 'defined' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{e.salary_status === 'defined' ? 'مُعرَّف' : 'بانتظار'}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="p-6 text-center text-xs text-slate-400">لا موظفون</li>}
          </ul>
        )}
      </div>
      {selected ? <SalaryForm key={selected.id} employeeId={selected.id} name={selected.full_name} defaultType={selected.contract_type} /> : <EmptyState title="اختر موظفاً لعرض ملف راتبه أو تعريفه" hint="" />}
    </div>
  )
}

type KV = Array<{ k: string; v: string }>
const toKV = (o: Record<string, number> | undefined): KV => Object.entries(o ?? {}).map(([k, v]) => ({ k, v: String(v) }))
const fromKV = (kv: KV) => Object.fromEntries(kv.filter((x) => x.k.trim() && Number(x.v) > 0).map((x) => [x.k.trim(), Number(x.v)]))

export function SalaryForm({ employeeId, name, defaultType }: { employeeId: string; name: string; defaultType: ContractType }) {
  const { data: p, isLoading } = useSalaryProfile(employeeId)
  if (isLoading) return <LoadingSpinner />
  return <SalaryFormInner key={p?.set_at ?? 'new'} employeeId={employeeId} name={name} defaultType={p?.pay_type ?? defaultType} profile={p ?? null} />
}
function SalaryFormInner({ employeeId, name, defaultType, profile }: { employeeId: string; name: string; defaultType: ContractType; profile: NonNullable<ReturnType<typeof useSalaryProfile>['data']> | null }) {
  const set = useSetSalary()
  const [payType, setPayType] = useState<ContractType>(defaultType)
  const [base, setBase] = useState(String(profile?.base_salary ?? '')); const [daily, setDaily] = useState(String(profile?.daily_rate ?? ''))
  const [allow, setAllow] = useState<KV>(toKV(profile?.allowances)); const [ded, setDed] = useState<KV>(toKV(profile?.fixed_deductions)); const [notes, setNotes] = useState(profile?.notes ?? '')
  const [err, setErr] = useState<string | null>(null)
  const sumA = Object.values(fromKV(allow)).reduce((a, b) => a + b, 0); const sumD = Object.values(fromKV(ded)).reduce((a, b) => a + b, 0)
  const save = async () => {
    const b = Number(base) || 0, d = Number(daily) || 0
    if (payType === 'monthly' && b <= 0) { setErr('الراتب الأساسي مطلوب للتعاقد الشهري'); return }
    if (payType === 'daily' && d <= 0) { setErr('أجر اليوم مطلوب للأجر اليومي'); return }
    setErr(null)
    try { await set.mutateAsync({ employeeId, payType, base: payType === 'monthly' ? b : 0, daily: payType === 'daily' ? d : 0, allowances: fromKV(allow), fixedDeductions: fromKV(ded), notes }) } catch { /* toast */ }
  }
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="salary-form">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold">ملف راتب: {name}</h3>{profile?.status === 'defined' && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">مُعرَّف منذ {profile.set_at ? new Date(profile.set_at).toLocaleDateString('ar-IQ-u-nu-latn') : ''}</span>}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sf-type" label="نوع التعاقد"><select id="sf-type" className={field} value={payType} onChange={(e) => setPayType(e.target.value as ContractType)} data-testid="sf-type"><option value="monthly">شهري</option><option value="daily">أجر يومي</option></select></Field>
        {payType === 'monthly'
          ? <Field id="sf-base" label="الراتب الأساسي (د.ع) *"><input id="sf-base" type="number" min={0} step={1000} className={field} value={base} onChange={(e) => setBase(e.target.value)} data-testid="sf-base" /></Field>
          : <Field id="sf-daily" label="أجر اليوم (د.ع) *"><input id="sf-daily" type="number" min={0} step={500} className={field} value={daily} onChange={(e) => setDaily(e.target.value)} data-testid="sf-daily" /></Field>}
      </div>
      <KVEditor title="المخصصات" items={allow} onChange={setAllow} total={sumA} testId="sf-allow" placeholder="مثال: نقل، سكن، خطورة" />
      <KVEditor title="الاستقطاعات الثابتة" items={ded} onChange={setDed} total={sumD} testId="sf-ded" placeholder="مثال: ضمان اجتماعي، سلفة" />
      <Field id="sf-notes" label="ملاحظات"><input id="sf-notes" className={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="rounded-xl bg-slate-50 p-3 text-xs" data-testid="sf-preview">
        {payType === 'monthly'
          ? <>الصافي الشهري التقديري (قبل استقطاعات العمليات): <b>{fmtMoney((Number(base) || 0) + sumA - sumD)}</b></>
          : <>مثال: 26 يوم حضور × {fmtMoney(Number(daily) || 0)} + مخصصات − ثابتة = <b>{fmtMoney((Number(daily) || 0) * 26 + sumA - sumD)}</b></>}
      </div>
      {err && <p className="text-xs font-bold text-red-600" role="alert" data-testid="sf-error">{err}</p>}
      <Button size="sm" onClick={() => void save()} isLoading={set.isPending} data-testid="sf-save">{profile?.status === 'defined' ? 'تحديث ملف الراتب' : 'تعريف الراتب'}</Button>
    </section>
  )
}
function KVEditor({ title, items, onChange, total, testId, placeholder }: { title: string; items: KV; onChange: (v: KV) => void; total: number; testId: string; placeholder: string }) {
  return (
    <div data-testid={testId}>
      <div className="mb-1 flex items-center justify-between"><p className="text-xs font-semibold text-slate-600">{title} <span className="text-slate-400">— الإجمالي {fmtMoney(total)}</span></p><button type="button" className="text-[11px] font-bold text-brand-700" onClick={() => onChange([...items, { k: '', v: '' }])} data-testid={`${testId}-add`}>+ إضافة</button></div>
      <div className="space-y-1">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1">
            <input className={clsx(field, 'flex-1')} placeholder={placeholder} value={it.k} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} data-testid={`${testId}-k-${i}`} />
            <input type="number" min={0} className={clsx(field, 'w-32')} placeholder="المبلغ" value={it.v} onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} data-testid={`${testId}-v-${i}`} />
            <button type="button" className="px-2 text-red-500" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="حذف">✕</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-[11px] text-slate-400">لا بنود</p>}
      </div>
    </div>
  )
}

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
