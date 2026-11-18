/**
 * «اعتماد وإرسال» أجور المتعهدين إلى المدير المفوض (الشؤون المالية) — لوحة جاهزية الشهر + ورقة التأكيد:
 *  · الشروط التي تمنع الإرسال تُعرض بأسمائها وبما يلزم لتجاوزها (الخادم يتحقق منها نفسها عند الإرسال)
 *  · طلب قائم ⇒ حالته ورابطه بدل الزر · طلب مرفوض ⇒ السبب + «إعادة الإرسال» (نسخة جديدة تُحسب من الأجور والبصمة الحالية)
 *  · بوابة الصلاحية (useCanCall) تُمرَّر من الصفحة: الزر معطَّل مع السبب لمن لا يملك finance_contractor_wages_close
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Link, useNavigate } from 'react-router'
import type { ContractorWagesBlocker, ContractorWagesReadiness } from '@sdk/disbursements.sdk'
import { DISBURSEMENT_STATUS_LABEL } from '@sdk/disbursements.sdk'
import { useContractorWagesClose } from '../hooks'
import { iqd, monthTitle } from '../format'
import { Alert, AmountBig, Kpi, Sheet, StatusChip, btnGhost, btnOk, btnPrimary } from './DisbursementUi'

/** ما الذي يمنع الإرسال وما المطلوب لتجاوزه */
export function blockerText(b: ContractorWagesBlocker, r: ContractorWagesReadiness): string {
  switch (b) {
    case 'month_not_locked': return 'غرفة العمليات لم تعتمد عدد المتعهدين لهذا الشهر بعد (الشهر غير مقفل) — تُرسَل الأجور بعد اعتمادها.'
    case 'active_request': return 'لهذا الشهر طلب صرف قائم.'
    case 'attendance_not_confirmed': return `حضور الشهر غير مؤكَّد من غرفة العمليات${r.attendance_pending_auto > 0 ? ` (${r.attendance_pending_auto} حضور تلقائي ينتظر التأكيد)` : ''} — البصمة هي أساس الحجب والاستقطاع.`
    case 'rates_missing': return `${r.missing_rates} متعهد بلا أجور محدَّدة لهذا الشهر — حدِّد أجريه اليوميين من الجدول أدناه.`
    case 'no_fingerprint': return `${r.no_fingerprint} متعهد بلا رقم بصمة في ملفه الوظيفي — يُضاف رقم البصمة من الموارد البشرية ليُحتسب حضوره.`
    case 'no_days': return 'لا أيام صرف معتمدة لأي متعهد في هذا الشهر.'
    case 'nothing_payable': return 'لا مبلغ مستحق بعد الحجب والاستقطاع (كل الأيام محجوبة بسبب البصمة).'
  }
}

export function ContractorWagesSendPanel({ month, readiness, loading, error, onRetry, noPermission, gateTitle }: {
  month: string; readiness: ContractorWagesReadiness | undefined; loading: boolean; error: boolean; onRetry: () => void
  /** لا يملك المستخدم finance_contractor_wages_close (من useCanCall في الصفحة) */
  noPermission: boolean; gateTitle: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const close = useContractorWagesClose()
  const navigate = useNavigate()
  const send = () => close.mutate({ month, note }, {
    onSuccess: (r) => { setOpen(false); setNote(''); navigate(`/finance/disbursements/${r.id}`) },
    onError: () => setOpen(false), // تغيّر الواقع (طلب قائم/شرط جديد): الخطاف حدّث الجاهزية وأظهر السبب
  })

  if (loading) return <section className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-500" data-testid="cw-send-loading" aria-busy="true">جارٍ فحص جاهزية الشهر للإرسال…</section>
  if (error || !readiness) {
    return (
      <Alert tone="red" title="تعذّر فحص جاهزية الشهر للإرسال." testId="cw-send-error">
        <button type="button" className="font-black underline" onClick={onRetry}>إعادة المحاولة</button>
      </Alert>
    )
  }

  const r = readiness
  const active = r.active_request
  // «طلب قائم» عرضٌ للحالة لا شرط منع: يظهر بحالته ورابطه ولا يُكرَّر في قائمة الشروط
  const blockers = r.blockers.filter((b) => b !== 'active_request')
  const rejected = !active ? r.latest_rejected : null
  const label = rejected ? 'إعادة الإرسال للمدير المفوض' : 'اعتماد وإرسال للمدير المفوض'
  return (
    <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="cw-send-panel" data-ready={r.can_send ? 'yes' : 'no'}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-[#0b3d6b]">إرسال الأجور إلى المدير المفوض</h2>
          <p className="text-[11px] leading-relaxed text-slate-500">{monthTitle(r.month)} — بعد اعتماده تصرفها الشؤون المالية من القاصة بحركة واحدة نهائية.</p>
        </div>
        {active && <StatusChip status={active.status} long testId="cw-send-status" />}
      </div>

      {active && (
        <Alert tone={active.status === 'paid' ? 'green' : 'slate'} testId="cw-send-active">
          الطلب <bdi dir="ltr" className="font-black">{active.request_no}</bdi>{active.version > 1 ? ` (النسخة ${active.version})` : ''} — {DISBURSEMENT_STATUS_LABEL[active.status]} · {iqd(active.net_total)}.{' '}
          <Link to={`/finance/disbursements/${active.id}`} className="font-black underline" data-testid="cw-send-active-link">فتح أمر الصرف</Link>
          <span className="mt-1 block text-[11px] text-slate-500">أجور الشهر مجمَّدة ما دام الطلب قائماً.</span>
        </Alert>
      )}

      {rejected && (
        <Alert tone="red" title={`رفض المدير المفوض الطلب ${rejected.request_no}:`} testId="cw-send-rejected">
          <span data-testid="cw-send-rejected-reason">{rejected.decision_note ?? '—'}</span>{' '}
          <Link to={`/finance/disbursements/${rejected.id}`} className="font-black underline">فتح الطلب المرفوض</Link>
          <span className="mt-1 block text-[11px]">صحِّح ما يلزم (الأجور أو غيرها) ثم أعد الإرسال — تُحسب النسخة الجديدة من الأرقام الحالية.</span>
        </Alert>
      )}

      {!active && (
        <>
          {blockers.length === 0 && r.net_total != null && (
            <dl className="grid grid-cols-2 gap-1.5" data-testid="cw-send-kpis">
              <Kpi label="المتعهدون" value={r.contractors} testId="cw-send-kpi-count" />
              <Kpi label="قبل الحجب والاستقطاع" value={iqd(r.gross_total)} testId="cw-send-kpi-gross" />
              <Kpi label="محجوب واستقطاع" value={iqd(r.deductions_total)} tone={(r.deductions_total ?? 0) > 0 ? 'red' : 'plain'} testId="cw-send-kpi-deductions" />
              <Kpi label="الصافي للإرسال" value={iqd(r.net_total)} tone="green" testId="cw-send-kpi-net" />
            </dl>
          )}
          {blockers.length > 0 && (
            <ul className="space-y-1.5" data-testid="cw-blockers" aria-label="ما يمنع الإرسال">
              {blockers.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700" data-testid={`cw-blocker-${b}`}>
                  <i aria-hidden className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-red-50 text-[11px] font-black not-italic text-red-700">✕</i>
                  <span>{blockerText(b, r)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={clsx(r.can_send ? btnOk : btnGhost, 'w-full')} disabled={!r.can_send || noPermission || close.isPending} title={gateTitle}
            onClick={() => setOpen(true)} data-testid="cw-send">
            {label}
          </button>
          {noPermission && gateTitle && <p className="text-[11px] font-bold text-amber-700" data-testid="cw-send-noperm">{gateTitle}</p>}
          {!r.can_send && blockers.length > 0 && <p className="text-[11px] text-slate-500">يُفعَّل الزر حين تُستوفى الشروط أعلاه.</p>}
        </>
      )}

      {open && !active && r.net_total != null && (
        <Sheet title={rejected ? 'إعادة إرسال أجور المتعهدين' : 'اعتماد وإرسال أجور المتعهدين'} onClose={() => setOpen(false)} busy={close.isPending} testId="cw-send-sheet">
          <div className="mt-1.5"><AmountBig value={r.net_total} size="xl" testId="cw-send-sheet-amount" /></div>
          <p className="text-xs leading-relaxed text-slate-600">لـ {r.contractors} متعهداً عن شهر {monthTitle(r.month)} (بعد الحجب والاستقطاع: {iqd(r.deductions_total)}).</p>
          <ul className="my-3 space-y-2 text-xs leading-relaxed text-slate-700">
            <li>✓ يصل الطلب إلى المدير المفوض فوراً بإشعار ليعتمده أو يرفضه بسبب.</li>
            <li>✓ لا يُخصم شيء من القاصة إلا حين تصرفه الشؤون المالية بعد اعتماده.</li>
            <li>✓ تتجمّد أجور الشهر ولا يُعاد فتحه من غرفة العمليات ما دام الطلب قائماً.</li>
          </ul>
          <label className="block text-xs font-black text-slate-700">ملاحظتك للمدير المفوض <span className="font-bold text-slate-400">(اختيارية)</span>
            <textarea className="mt-2 min-h-[4.5rem] w-full resize-none rounded-xl border-[1.5px] border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 outline-none focus:border-[#0b4f8a]" value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} data-testid="cw-send-note" />
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" className={clsx(btnPrimary, 'flex-[2]')} disabled={close.isPending} onClick={send} data-testid="cw-send-confirm">{close.isPending ? 'جارٍ الإرسال…' : label}</button>
            <button type="button" className={clsx(btnGhost, 'flex-1')} disabled={close.isPending} onClick={() => setOpen(false)} data-testid="cw-send-cancel">رجوع</button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
