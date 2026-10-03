/** عناصر مشتركة لوحدة الكشوفات (00170): شارات · تنسيق · صف الجدول · بطاقة */
import clsx from 'clsx'
import { DISCLOSURE_STATUS_LABEL, type DisclosureStatusV2, type DisclosureV2 } from '@sdk/disclosures-unit.sdk'
import { fmtDate, fmtIqd, penaltyLabel } from './ui'

const STATUS_TONE: Record<DisclosureStatusV2, string> = {
  draft: 'bg-slate-100 text-slate-700', pending: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', returned: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', cancelled: 'bg-slate-200 text-slate-600 line-through',
}
export function StatusBadge({ status, step }: { status: DisclosureStatusV2; step?: string | null }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black', STATUS_TONE[status])} data-testid="disc-status">
      {DISCLOSURE_STATUS_LABEL[status]}{status === 'pending' && step ? <span className="font-bold opacity-80">· عند {step}</span> : null}
    </span>
  )
}
export function TargetChip({ d }: { d: DisclosureV2 }) {
  return d.target_kind === 'vehicle'
    ? <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-700"><span>آلية</span><span dir="ltr">DB {d.db_number}</span></span>
    : <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-bold text-violet-700">موظف{d.employee_number ? <span dir="ltr">#{d.employee_number}</span> : null}</span>
}
/** جدول الكشوفات — مضغوط على الموبايل (بطاقات) وجدول كامل على الشاشات الواسعة */
export function DisclosureTable({ rows, onOpen, emptyText = 'لا توجد كشوفات', testId = 'disc-table', extra }: { rows: DisclosureV2[]; onOpen: (d: DisclosureV2) => void; emptyText?: string; testId?: string; extra?: (d: DisclosureV2) => React.ReactNode }) {
  if (rows.length === 0) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500" data-testid={`${testId}-empty`}>{emptyText}</div>
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block" data-testid={testId}>
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-[11px] font-black text-slate-500">
            <tr>
              <th className="px-3 py-2">الرقم</th><th className="px-3 py-2">الهدف</th><th className="px-3 py-2">الاسم</th><th className="px-3 py-2">النوع</th><th className="px-3 py-2">تاريخ المخالفة</th>
              <th className="px-3 py-2">المبلغ</th><th className="px-3 py-2">الحالة</th><th className="px-3 py-2">مُعدّه</th><th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((d) => (
              <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(d)} data-testid={`disc-row-${d.id}`}>
                <td className="px-3 py-2 font-mono text-xs text-slate-600" dir="ltr">{d.ref_no ?? '—'}</td>
                <td className="px-3 py-2"><TargetChip d={d} /></td>
                <td className="px-3 py-2 font-bold text-slate-800">{d.target_kind === 'vehicle' ? d.driver_name : d.employee_name}{d.target_kind === 'vehicle' && d.sector ? <span className="block text-[11px] font-normal text-slate-500">{d.sector}</span> : null}</td>
                <td className="px-3 py-2">{d.type_label}{d.penalty_type ? <span className="block text-[11px] text-slate-500">{penaltyLabel(d.penalty_type)}</span> : null}</td>
                <td className="px-3 py-2 text-xs" dir="ltr">{fmtDate(d.log_date)}</td>
                <td className="px-3 py-2 text-xs font-bold tabular-nums">{fmtIqd(d.amount)}</td>
                <td className="px-3 py-2"><StatusBadge status={d.status} step={d.current_step} /></td>
                <td className="px-3 py-2 text-xs text-slate-600">{d.prepared_by_name ?? '—'}</td>
                <td className="px-3 py-2 text-left" onClick={(e) => e.stopPropagation()}>{extra?.(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-2 md:hidden" data-testid={`${testId}-cards`}>
        {rows.map((d) => (
          <li key={d.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" onClick={() => onOpen(d)}>
            <div className="flex flex-wrap items-center gap-1.5"><TargetChip d={d} /><StatusBadge status={d.status} step={d.current_step} /><span className="ms-auto font-mono text-[11px] text-slate-500" dir="ltr">{d.ref_no ?? ''}</span></div>
            <div className="mt-1 font-black text-slate-800">{d.target_kind === 'vehicle' ? d.driver_name : d.employee_name}</div>
            <div className="text-xs text-slate-600">{d.type_label} · <span dir="ltr">{fmtDate(d.log_date)}</span> · {fmtIqd(d.amount)}</div>
            {extra ? <div className="mt-2" onClick={(e) => e.stopPropagation()}>{extra(d)}</div> : null}
          </li>
        ))}
      </ul>
    </>
  )
}

export function Field({ label, children, hint, testId }: { label: string; children: React.ReactNode; hint?: string; testId?: string }) {
  return (
    <label className="block" data-testid={testId}>
      <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  )
}
