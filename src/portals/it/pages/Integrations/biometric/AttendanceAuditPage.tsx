/**
 * سجل تعديلات الحضور (00178) — بوابة التطوير المركزية
 * ─────────────────────────────────────────────────────
 * كل إجراء تشغيلي على حضور الموظفين (تعديل يوم، إعادة احتساب، استقطاع يدوي، إلغاء استقطاع مقترح، تصدير/اعتماد شهر)
 * يصل إلى هنا تلقائياً من سجل التدقيق مع اسم الموظف والمدقّق والسبب والفرق قبل/بعد. للقراءة فقط.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAttendanceAuditNamed } from '@features/hr'
import type { AttendanceAuditRow } from '@features/hr'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { field } from '@portals/hr/components/hr-format'
import { ACTION_TONE, AUDIT_ACTION_LABELS, auditDiff } from './attendance-audit.utils'

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function AttendanceAuditPage() {
  const today = new Date()
  const [from, setFrom] = useState(isoDay(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(isoDay(today))
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')
  const { data: rows = [], isLoading, refetch, isFetching } = useAttendanceAuditNamed({ from, to, limit: 1000 })
  const filtered = useMemo(() => rows.filter((r) => (!action || r.action === action) && (!search || r.full_name.includes(search) || r.employee_number.includes(search) || (r.actor_name ?? '').includes(search))), [rows, action, search])
  const counts = useMemo(() => {
    const c = { edits: 0, resets: 0, deductions: 0, waives: 0 }
    for (const r of rows) {
      if (r.action === 'edit') c.edits++
      else if (r.action === 'reset_auto') c.resets++
      else if (r.action === 'deduction_add' || r.action === 'deduction_delete') c.deductions++
      else if (r.action === 'waive' || r.action === 'unwaive') c.waives++
    }
    return c
  }, [rows])

  return (
    <div className="space-y-4" data-testid="it-attendance-audit-page">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">سجل تعديلات الحضور</h1>
          <p className="text-xs text-slate-500">كل إجراء من غرفة العمليات على حضور الموظفين يصل هنا تلقائياً مع اسم المدقّق والسبب والفرق قبل/بعد — للقراءة فقط.</p>
        </div>
        <button type="button" className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold hover:bg-slate-50" onClick={() => void refetch()} disabled={isFetching} data-testid="audit-refresh">
          <Icon name="refresh" className={clsx('h-4 w-4', isFetching && 'animate-spin')} /> تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['تعديلات أيام', counts.edits, 'audit-k-edits'], ['إعادة احتساب', counts.resets, 'audit-k-resets'], ['استقطاعات يدوية', counts.deductions, 'audit-k-deductions'], ['إلغاء/إعادة استقطاع', counts.waives, 'audit-k-waives']].map(([t, v, id]) => (
          <div key={String(id)} className="rounded-2xl border border-slate-200 bg-white p-3" data-testid={String(id)}>
            <p className="text-[11px] text-slate-500">{t}</p><p className="text-2xl font-black tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-4">
        <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">من</span><input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="audit-from" /></label>
        <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">إلى</span><input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="audit-to" /></label>
        <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">الإجراء</span>
          <select className={field} value={action} onChange={(e) => setAction(e.target.value)} data-testid="audit-action">
            <option value="">الكل</option>
            {(Object.keys(AUDIT_ACTION_LABELS) as AttendanceAuditRow['action'][]).map((k) => <option key={k} value={k}>{AUDIT_ACTION_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">بحث (موظف / رقم / مدقّق)</span><input className={field} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم أو رقم" data-testid="audit-search" /></label>
      </div>

      {isLoading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <EmptyState title="لا تعديلات في هذه الفترة" hint="أي تعديل من غرفة العمليات على الحضور سيظهر هنا فور حدوثه" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-xs" data-testid="audit-table">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-2 text-start">وقت الإجراء</th><th className="p-2 text-start">الإجراء</th><th className="p-2 text-start">الموظف</th>
                <th className="p-2">يوم الحضور</th><th className="p-2 text-start">الفرق</th><th className="p-2 text-start">السبب</th><th className="p-2 text-start">المدقّق</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const diff = auditDiff(r.before, r.after)
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top" data-testid={`audit-row-${r.id}`}>
                    <td className="whitespace-nowrap p-2 tabular-nums text-slate-600">{new Date(r.created_at).toLocaleString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="p-2"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', ACTION_TONE[r.action])}>{AUDIT_ACTION_LABELS[r.action] ?? r.action}</span></td>
                    <td className="p-2"><p className="font-bold">{r.full_name}</p><p className="text-[10px] text-slate-500" dir="ltr">{r.employee_number}{r.department_name ? ` · ${r.department_name}` : ''}</p></td>
                    <td className="whitespace-nowrap p-2 text-center tabular-nums">{r.work_date}</td>
                    <td className="p-2">
                      {diff.length === 0 ? <span className="text-slate-400">—</span> : (
                        <ul className="space-y-0.5">{diff.map((d) => <li key={d.key}><span className="text-slate-500">{d.label}:</span> <span className="tabular-nums">{d.from}</span> <span className="text-slate-400">←</span> <b className="tabular-nums">{d.to}</b></li>)}</ul>
                      )}
                    </td>
                    <td className="max-w-[18rem] p-2 text-slate-700">{r.reason}</td>
                    <td className="p-2 text-slate-700">{r.actor_name ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
