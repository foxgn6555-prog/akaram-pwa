/**
 * بوابة الموارد البشرية — «من في الدوام الآن» (00389-ب) — قراءة فقط، يتحدّث تلقائيًا كل 30 ثانية.
 * الحالة لكل موظف اليوم بحسب شفته الفعلي: لم يحضر بعد / غائب / حاضر متأخرًا / بصمة ناقصة / حاضر / أكمل الدوام / قبل الدوام / في إجازة / يوم راحة / بلا شفت.
 * لا يغيّر أي شيء في محرّك الحضور أو الخصومات — التعديل يبقى في غرفة العمليات.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import { NOW_STATE_LABELS, NOW_STATE_ORDER, useNowBoard } from '@features/hr'
import type { NowBoardRow, NowState } from '@features/hr'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { StatCard } from '../../components/hr-ui'
import { field, fmtMinutes, fmtTime } from '../../components/hr-format'
import { ExportButton } from '../../components/ExportButton'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import type { ExportSpec } from '@features/hr/lib/hrExcel'

export const NOW_STYLE: Record<NowState, string> = {
  missing: 'bg-red-100 text-red-800', absent: 'bg-red-50 text-red-700', late: 'bg-amber-100 text-amber-800', incomplete: 'bg-violet-100 text-violet-800',
  present: 'bg-emerald-100 text-emerald-800', done: 'bg-emerald-50 text-emerald-700', upcoming: 'bg-slate-100 text-slate-600', leave: 'bg-sky-100 text-sky-800', rest: 'bg-slate-100 text-slate-500', off: 'bg-slate-50 text-slate-400',
}
const TONE: Record<NowState, 'red' | 'amber' | 'emerald' | 'sky' | 'violet' | 'slate'> = { missing: 'red', absent: 'red', late: 'amber', incomplete: 'violet', present: 'emerald', done: 'emerald', upcoming: 'slate', leave: 'sky', rest: 'slate', off: 'slate' }
const hm = (t: string | null) => (t ? t.slice(0, 5) : '—')

/** نسبة الحضور الفعلية الآن: (حاضر + متأخر + أكمل + ناقص) ÷ المطلوب حضورهم الآن (يستثني قبل الدوام/إجازة/راحة/بلا شفت) */
export function presenceRatio(rows: NowBoardRow[]): { present: number; expected: number; pct: number } {
  const present = rows.filter((r) => ['present', 'late', 'done', 'incomplete'].includes(r.state)).length
  const expected = present + rows.filter((r) => r.state === 'missing' || r.state === 'absent').length
  return { present, expected, pct: expected ? Math.round((present / expected) * 100) : 0 }
}
export function nowBoardSpec(rows: NowBoardRow[], filters: Array<[string, string]>): ExportSpec<NowBoardRow> {
  return {
    title: 'من في الدوام الآن', sheetName: 'الدوام الآن', fileName: `الدوام-الآن-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.xlsx`, rows, filters,
    columns: [
      { key: 'employee_number', header: 'الرقم الوظيفي', width: 12, value: (r) => r.employee_number ?? '', align: 'center' },
      { key: 'full_name', header: 'الاسم', width: 26, value: (r) => r.full_name },
      { key: 'department_name', header: 'القسم', width: 18, value: (r) => r.department_name ?? '' },
      { key: 'shift_name', header: 'الشفت', width: 14, value: (r) => r.shift_name ?? '' },
      { key: 'expected', header: 'الدوام', width: 13, value: (r) => (r.expected_in ? `${hm(r.expected_in)}–${hm(r.expected_out)}` : ''), align: 'center' },
      { key: 'check_in', header: 'الدخول', width: 9, value: (r) => (r.check_in ? fmtTime(r.check_in) : ''), align: 'center' },
      { key: 'check_out', header: 'الخروج', width: 9, value: (r) => (r.check_out ? fmtTime(r.check_out) : ''), align: 'center' },
      { key: 'late_minutes', header: 'التأخير (د)', width: 10, value: (r) => r.late_minutes || '', align: 'center' },
      { key: 'state', header: 'الحالة', width: 14, value: (r) => NOW_STATE_LABELS[r.state], align: 'center' },
    ],
  }
}

export default function NowBoardPage() {
  const [branchId, setBranchId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [search, setSearch] = useState('')
  const [state, setState] = useState<NowState | ''>('')
  const { data: branches = [] } = useBranches()
  const { data: departments = [] } = useDepartments()
  const { data: rows = [], isLoading, dataUpdatedAt, isFetching } = useNowBoard(branchId, departmentId, search.trim())
  const counts = useMemo(() => Object.fromEntries(NOW_STATE_ORDER.map((s) => [s, rows.filter((r) => r.state === s).length])) as Record<NowState, number>, [rows])
  const visible = useMemo(() => (state ? rows.filter((r) => r.state === state) : rows), [rows, state])
  const ratio = presenceRatio(rows)
  const filters: Array<[string, string]> = [['الفرع', branches.find((b) => b.id === branchId)?.name ?? 'الكل'], ['القسم', departments.find((d) => d.id === departmentId)?.name ?? 'الكل'], ['الحالة', state ? NOW_STATE_LABELS[state] : 'الكل'], ['وقت السحب', dataUpdatedAt ? fmtTime(new Date(dataUpdatedAt).toISOString()) : '—']]
  return (
    <div className="space-y-4" data-testid="hr-now">
      <ExecPageHeader icon="clock" title="من في الدوام الآن" subtitle="صورة لحظية مشتقة من البصمات وشفت كل موظف والإجازات المعتمدة · تتحدّث كل 30 ثانية · قراءة فقط (التعديل في غرفة العمليات)"
        actions={<div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span data-testid="now-updated" dir="ltr">{dataUpdatedAt ? fmtTime(new Date(dataUpdatedAt).toISOString()) : '—'}{isFetching ? ' ⟳' : ''}</span>
          <ExportButton disabled={!visible.length} testId="now-export" onExport={() => exportToExcel(nowBoardSpec(visible, filters))} />
        </div>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title="نسبة الحضور الآن" value={`${ratio.pct}%`} hint={`${ratio.present} من ${ratio.expected} مطلوب حضورهم`} tone={ratio.pct >= 90 ? 'emerald' : ratio.pct >= 70 ? 'amber' : 'red'} testId="now-ratio" />
        {(['missing', 'late', 'present', 'absent', 'leave'] as NowState[]).map((s) => (
          <button key={s} type="button" onClick={() => setState(state === s ? '' : s)} className={clsx('text-start', state === s && 'rounded-2xl ring-2 ring-brand-400')} data-testid={`now-stat-${s}`}>
            <StatCard title={NOW_STATE_LABELS[s]} value={counts[s]} tone={TONE[s]} />
          </button>
        ))}
      </div>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-4" data-testid="now-filters">
        <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="now-branch"><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="now-dept"><option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select className={field} value={state} onChange={(e) => setState(e.target.value as NowState | '')} data-testid="now-state"><option value="">كل الحالات</option>{NOW_STATE_ORDER.map((s) => <option key={s} value={s}>{NOW_STATE_LABELS[s]} ({counts[s]})</option>)}</select>
        <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="now-search" />
      </div>
      {isLoading ? <LoadingSpinner /> : visible.length === 0 ? <EmptyState title="لا موظفين ضمن هذا الاختيار" hint="تأكد من إسناد الشفتات للموظفين من غرفة العمليات / الموارد البشرية." /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="now-table">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القسم / الفرع</th><th className="p-2">الشفت</th><th className="p-2">الدوام</th><th className="p-2">الدخول</th><th className="p-2">الخروج</th><th className="p-2">التأخير</th><th className="p-2">الحالة</th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.employee_id} className={clsx('border-t border-slate-100', r.state === 'missing' && 'bg-red-50/40')} data-testid={`now-row-${r.employee_number}`}>
                  <td className="p-2"><p className="font-semibold">{r.full_name}</p><p className="text-[11px] text-slate-500" dir="ltr">{r.employee_number}</p></td>
                  <td className="p-2 text-xs">{r.department_name ?? '—'}<span className="block text-[10px] text-slate-400">{r.branch_name ?? ''}</span></td>
                  <td className="p-2 text-center text-xs">{r.shift_name ?? '—'}</td>
                  <td className="p-2 text-center text-[11px] tabular-nums text-slate-500" dir="ltr">{r.expected_in ? `${hm(r.expected_in)}–${hm(r.expected_out)}` : '—'}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_in)}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_out)}</td>
                  <td className={clsx('p-2 text-center text-xs tabular-nums', r.late_minutes > 0 && 'font-bold text-amber-700')}>{fmtMinutes(r.late_minutes)}</td>
                  <td className="p-2 text-center"><span className={clsx('inline-block rounded-md px-2 py-0.5 text-[11px] font-bold', NOW_STYLE[r.state])}>{NOW_STATE_LABELS[r.state]}{r.state === 'leave' && r.leave_type ? ` (${r.leave_type})` : ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-[11px] text-slate-500" data-testid="now-count">{visible.length} موظف</p>
        </div>
      )}
    </div>
  )
}
