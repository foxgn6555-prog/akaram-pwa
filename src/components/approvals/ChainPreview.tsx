/**
 * 00391: معاينة سلسلة الموافقات لموظف قبل إرسال الطلب + تشخيص «لماذا لا توجد سلسلة».
 * تعتمد على RPC approval_diagnose (IT/HR/غرفة العمليات/الموظف نفسه/مديره).
 * - ok=true: تعرض الخطوات ومن سيوافق (أو المدير المباشر عند غياب السلسلة).
 * - ok=false: تعرض السبب الدقيق وقائمة فحوص (قسم؟ سلسلة قسم؟ حساب؟ سلسلة دور؟ مدير؟) وما يجب فعله.
 */
import clsx from 'clsx'
import { useApprovalDiagnose } from '@features/sector-manager/hooks'
import type { ApprovalRequestType } from '@sdk/sector-manager.sdk'

const FALLBACK_LABEL: Record<string, string> = { chain: 'سلسلة موافقات', manager: 'المدير المباشر (بلا سلسلة)', hr_only: 'يُحال إلى الموارد البشرية', none: 'لا أحد — سيُرفض' }

export function ChainPreview({ employeeId, type, subtype = null, detailed = false, testId = 'chain-preview' }: { employeeId: string | null | undefined; type: ApprovalRequestType; subtype?: string | null; detailed?: boolean; testId?: string }) {
  const q = useApprovalDiagnose(employeeId, type, subtype)
  if (!employeeId) return null
  if (q.isLoading) return <p className="text-[11px] text-slate-400" data-testid={`${testId}-loading`}>جارٍ فحص سلسلة الموافقات…</p>
  if (q.isError || !q.data) return <p className="text-[11px] text-rose-700" data-testid={`${testId}-error`}>تعذّر فحص سلسلة الموافقات</p>
  const d = q.data
  const typeLabel = type === 'time_permit' ? 'الزمنية' : type === 'advance' ? 'السلفة' : 'الإجازة'
  return (
    <div className={clsx('rounded-xl border p-2 text-xs', d.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60')} data-testid={testId} data-ok={d.ok ? '1' : '0'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', d.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')} data-testid={`${testId}-fallback`}>{FALLBACK_LABEL[d.fallback] ?? d.fallback}</span>
        <span className="font-bold">مسار موافقة {typeLabel}:</span>
        {d.chain ? (
          <span data-testid={`${testId}-scope`}>
            {d.chain.scope === 'department' ? <>سلسلة قسم «{d.chain.department_name}»{d.chain.include_children ? ' (تشمل الأقسام الفرعية)' : ''}</> : <>سلسلة دور «{d.chain.requester_label}»</>}
            {d.chain.subtype ? <span className="text-slate-500"> · النوع الفرعي: {d.chain.subtype}</span> : null}
          </span>
        ) : d.fallback === 'manager' ? <span data-testid={`${testId}-scope`}>المدير المباشر: <b>{d.employee.manager_name}</b></span>
          : d.fallback === 'hr_only' ? <span data-testid={`${testId}-scope`}>تقرّره <b>الموارد البشرية</b> (بلا سلسلة وبلا مدير قادر على البتّ)</span> : null}
      </div>
      {d.chain && d.steps.length > 0 && (
        <ol className="mt-2 space-y-1" data-testid={`${testId}-steps`}>
          {d.steps.map((s) => (
            <li key={s.step_no} className={clsx('flex flex-wrap items-center gap-2 rounded-lg border bg-white px-2 py-1', s.status !== 'active' && 'opacity-60')} data-testid={`${testId}-step-${s.step_no}`}>
              <span className="font-black">{s.step_no}.</span><span className="font-bold">{s.label}</span>
              <span className="ms-auto">
                {s.status === 'active' && <>{s.approvers.map((a) => a.name).join('، ') || '—'}{s.delegates.length > 0 && <span className="text-indigo-700"> (بالتفويض: {s.delegates.map((x) => x.to_name).join('، ')})</span>}</>}
                {s.status === 'skipped_condition' && <span className="text-slate-500">تُخطّى — الشرط غير متحقق</span>}
                {s.status === 'skipped_nobody' && <span className="text-rose-700">تُخطّى — لا يوجد معتمِد</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {d.reason && <p className={clsx('mt-2 font-bold', d.ok ? 'text-slate-700' : 'text-rose-800')} data-testid={`${testId}-reason`}>{d.reason}</p>}
      {d.hints.length > 0 && (
        <ul className="mt-1 list-disc ps-5 text-[11px] text-slate-700" data-testid={`${testId}-hints`}>
          {d.hints.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}
      {(detailed || !d.ok) && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2" data-testid={`${testId}-checks`}>
          {d.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-1 rounded-lg bg-white/70 px-2 py-1" data-testid={`${testId}-check-${c.key}`} data-ok={c.ok ? '1' : '0'}>
              <span className={clsx('mt-0.5 inline-block size-3 shrink-0 rounded-full', c.ok ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden />
              <span><b>{c.label}:</b> <span className="text-slate-600">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
      {detailed && d.department_path.length > 0 && (
        <div className="mt-2 text-[11px]" data-testid={`${testId}-path`}>
          <b>مسار القسم (الأقرب أولاً):</b>{' '}
          {d.department_path.map((n) => (
            <span key={n.department_id} className="me-2 inline-flex items-center gap-1">
              {n.depth > 0 && <span className="text-slate-400">←</span>}
              <span className={clsx('rounded-md px-1.5 py-0.5', n.chains.some((c) => c.applies) ? 'bg-emerald-100 text-emerald-900' : n.chains.length > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600')}>
                {n.name}{n.chains.length > 0 ? ` (${n.chains.filter((c) => c.applies).length}/${n.chains.length} سلسلة تنطبق)` : ' (بلا سلسلة)'}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
