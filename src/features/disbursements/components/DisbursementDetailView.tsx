/**
 * معاينة طلب الصرف — مشتركة بين «معاينة وقرار» (المدير المفوض) و«أمر الصرف» (المالية):
 *  · رأس: رجوع + العنوان + الحالة · مسار الخطوات (إقفال ← قرار ← صرف)
 *  · بطاقة الملخص: المبلغ الكبير + الأرقام المجمَّدة + الرصيد وما يبقى بعد الصرف (أو النقص)
 *  · الرفض بسببه، والصرف بمرجع القاصة، والرصيد غير الكافي بوضوح · سجل الطلب · أسطر الأشخاص بمرشّحاتها
 *  · الأزرار (اعتماد/رفض/صرف/إعادة إرسال) والأوراق تُمرَّر من صفحة البوابة لأنها تملك بوابات الصلاحية
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { fmtMoney } from '@portals/hr/components/hr-format'
import { disbursementErrorMessage, type DisbursementDetail, type DisbursementEvent } from '@sdk/disbursements.sdk'
import { useDisbursementDetail } from '../hooks'
import { agoAr, changePct, clock, iqd, monthTitle, signedPct, stamp } from '../format'
import { Alert, AmountBig, Kpi, StatusChip } from './DisbursementUi'
import { DisbursementLinesPanel } from './DisbursementLines'
import type { DisbursementPortal } from './DisbursementsListView'

const EVENT_LABEL: Record<DisbursementEvent['event'], string> = { created: 'أُنشئ الطلب', approved: 'اعتمده المدير المفوض', rejected: 'رفضه المدير المفوض', paid: 'صُرف من القاصة', resubmitted: 'أُعيد إرساله' }

type StepState = 'done' | 'current' | 'todo' | 'bad'
function steps(d: DisbursementDetail): Array<{ label: string; state: StepState }> {
  const s = d.request.status
  return [
    { label: 'إقفال الشهر', state: 'done' },
    { label: s === 'rejected' ? 'رفض المدير المفوض' : 'اعتماد المدير المفوض', state: s === 'pending_approval' ? 'current' : s === 'rejected' ? 'bad' : 'done' },
    { label: 'الصرف من القاصة', state: s === 'paid' ? 'done' : s === 'approved' ? 'current' : 'todo' },
  ]
}
const STEP_TONE: Record<StepState, string> = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700', current: 'border-amber-200 bg-amber-50 text-amber-700',
  todo: 'border-slate-200 bg-slate-100 text-slate-500', bad: 'border-red-200 bg-red-50 text-red-700',
}

export function DisbursementDetailView({ portal, id, actionBar, overlays }: {
  portal: DisbursementPortal; id: string | undefined
  actionBar?: (d: DisbursementDetail) => ReactNode
  overlays?: (d: DisbursementDetail) => ReactNode
}) {
  const basePath = portal === 'admin' ? '/admin/disbursements' : '/finance/disbursements'
  const q = useDisbursementDetail(id)
  const d = q.data

  const back = (
    <Link to={basePath} aria-label="رجوع إلى قائمة الطلبات" className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm" data-testid="disb-back">
      <Icon name="chevron-right" size={18} />
    </Link>
  )
  if (q.isLoading) return <div className="space-y-3 pb-4"><div className="flex items-center gap-2">{back}</div><LoadingSpinner /></div>
  if (q.isError || !d) {
    return (
      <div className="space-y-3 pb-4" data-testid="disb-detail-error">
        <div className="flex items-center gap-2">{back}<h1 className="text-[15px] font-black">{portal === 'admin' ? 'معاينة طلب الصرف' : 'أمر الصرف'}</h1></div>
        <Alert tone="red" title="تعذّر فتح الطلب.">{disbursementErrorMessage(q.error)} <button type="button" className="font-black underline" onClick={() => void q.refetch()}>إعادة المحاولة</button></Alert>
      </div>
    )
  }

  const r = d.request
  const pct = changePct(r.net_total, r.prev_net_total)
  const open = r.status === 'pending_approval' || r.status === 'approved'
  const contractors = r.kind === 'contractor_wages'
  const peopleWord = contractors ? 'المتعهدين' : 'الموظفين'
  return (
    <div className="space-y-3 pb-4" data-testid={`${portal}-disbursement-detail`} data-status={r.status} data-kind={r.kind}>
      <div className="flex items-center gap-2">
        {back}
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-black text-slate-900">{portal === 'admin' ? 'معاينة طلب الصرف' : 'أمر الصرف'}</h1>
        <StatusChip status={r.status} long testId="disb-detail-status" />
      </div>

      <ol className="flex flex-wrap gap-1.5" aria-label="مسار الطلب" data-testid="disb-steps">
        {steps(d).map((s) => <li key={s.label} className={clsx('inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-black', STEP_TONE[s.state])} data-state={s.state}>{s.state === 'done' ? '✓ ' : ''}{s.label}</li>)}
      </ol>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="disb-summary">
        <p className="text-[11px] font-extrabold leading-snug text-slate-500">{r.kind_label} — {monthTitle(r.period_month)} · <bdi dir="ltr">{r.request_no}</bdi>{r.version > 1 ? ` · النسخة ${r.version}` : ''}</p>
        <AmountBig value={r.net_total} size="xl" testId="disb-detail-amount" />
        <dl className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1" data-testid="disb-kpis">
          <Kpi label={`عدد ${peopleWord}`} value={fmtMoney(r.people_count)} testId="disb-kpi-count" />
          {r.payable_count !== r.people_count && <Kpi label="يُصرف لهم فعلاً" value={fmtMoney(r.payable_count)} testId="disb-kpi-payable" />}
          <Kpi label={contractors ? 'أجور أيام الصرف' : 'قبل الاستقطاعات'} value={fmtMoney(r.gross_total)} testId="disb-kpi-gross" />
          <Kpi label={contractors ? 'محجوب واستقطاع' : 'الاستقطاعات'} value={fmtMoney(r.deductions_total)} tone={r.deductions_total > 0 ? 'red' : 'plain'} testId="disb-kpi-deductions" />
          {contractors && (r.blocked_days ?? 0) > 0 && <Kpi label="أيام محجوبة بالبصمة" value={`${fmtMoney(r.blocked_days)} ${r.blocked_days === 1 ? 'يوم' : 'أيام'}`} tone="amber" testId="disb-kpi-blocked" />}
          {r.other_adjustments !== 0 && <Kpi label="تسويات على الصافي" value={`${r.other_adjustments > 0 ? '+' : '−'}${fmtMoney(Math.abs(r.other_adjustments))}`} tone="amber" testId="disb-kpi-adjustments" />}
          {pct != null && <Kpi label="مقارنة بالشهر الماضي" value={signedPct(pct)} tone={Math.abs(pct) >= 10 ? 'amber' : 'plain'} testId="disb-kpi-change" />}
          {r.status !== 'pending_approval' && r.decided_at && <Kpi label={r.status === 'rejected' ? 'رفضه' : 'اعتمده'} value={`${r.decided_by_name ?? 'المدير المفوض'} · ${clock(r.decided_at)}`} testId="disb-kpi-decided" />}
        </dl>
        {open && (
          <dl className="mt-2 grid grid-cols-2 gap-1.5 sm:max-w-xl" data-testid="disb-treasury">
            <Kpi label="رصيد القاصة الآن" value={iqd(d.balance)} tone={d.shortfall > 0 ? 'bad' : 'green'} testId="disb-balance" />
            {d.shortfall > 0
              ? <Kpi label="النقص عن المطلوب" value={iqd(d.shortfall)} tone="bad" testId="disb-shortfall" />
              : <Kpi label="يبقى بعد الصرف" value={iqd(d.balance_after)} tone="green" testId="disb-balance-after" />}
          </dl>
        )}
      </section>

      {r.status === 'pending_approval' && portal === 'finance' && <Alert tone="amber" testId="disb-note-pending">بانتظار قرار المدير المفوض — أُرسل {agoAr(r.requested_at)}. لا يُصرف قبل اعتماده.</Alert>}
      {r.status === 'approved' && d.shortfall > 0 && (portal === 'finance'
        ? <Alert tone="red" title="تعذّر الصرف:" testId="disb-note-insufficient">رصيد القاصة غير كافٍ لهذا الصرف — سجِّل استلاماً يغطيه أولاً. لم يُخصم أي مبلغ.</Alert>
        : <Alert tone="amber" testId="disb-note-insufficient">رصيد القاصة لا يغطي هذا الطلب حالياً (النقص {iqd(d.shortfall)}) — تصرفه المالية بعد تغطية الرصيد.</Alert>)}
      {r.status === 'approved' && portal === 'finance' && (
        <Alert tone="slate" title="ما الذي يحدث عند الصرف؟" testId="disb-note-howto">حركة واحدة نهائية في القاصة بنوع «{r.kind_label}» بمبلغ الطلب المعتمد نفسه، ثم يُبلَّغ المدير المفوض بإتمام الصرف.</Alert>
      )}
      {r.status === 'approved' && portal === 'admin' && <Alert tone="green" testId="disb-note-approved">اعتمدتَ هذا الطلب — بانتظار صرف الشؤون المالية من القاصة.</Alert>}
      {r.status === 'paid' && <Alert tone="green" title="تم الصرف:" testId="disb-note-paid">حركة القاصة <bdi dir="ltr" className="font-black">{r.treasury_ref_no ?? '—'}</bdi> · {r.paid_by_name ?? '—'} · {stamp(r.paid_at)}</Alert>}
      {r.status === 'rejected' && (
        <div className="space-y-1.5" data-testid="disb-note-rejected">
          <Alert tone="red" title={`رفضه ${r.decided_by_name ?? 'المدير المفوض'} — ${stamp(r.decided_at)}`}><span className="block pt-0.5" data-testid="disb-rejection-reason">السبب: {r.decision_note ?? '—'}</span></Alert>
          {r.resubmitted_id && (
            <Alert tone="green" testId="disb-note-resubmitted">أُعيد إرساله: <Link className="font-black underline" to={`${basePath}/${r.resubmitted_id}`} data-testid="disb-resubmitted-link">النسخة {r.resubmitted_version} (<bdi dir="ltr">{r.resubmitted_no}</bdi>)</Link></Alert>
          )}
        </div>
      )}
      {r.supersedes_id && <Alert tone="slate" testId="disb-note-supersedes">نسخة جديدة من طلب سبق رفضه — راجع سجل الطلب أدناه.</Alert>}

      {d.events.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="disb-events">
          <summary className="cursor-pointer text-xs font-black text-slate-800">سجل الطلب ({d.events.length})</summary>
          <ol className="mt-2 space-y-2">
            {d.events.map((e) => (
              <li key={e.id} className="border-s-2 border-slate-200 ps-2.5 text-[11px] leading-relaxed text-slate-700" data-event={e.event}>
                <b className="font-black text-slate-900">{EVENT_LABEL[e.event]}</b>{e.actor_name ? ` — ${e.actor_name}` : ''}
                <span className="block text-slate-500">{stamp(e.created_at)}{e.amount != null ? ` · ${iqd(e.amount)}` : ''}</span>
                {e.note && <span className="block text-slate-700">«{e.note}»</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      <DisbursementLinesPanel detail={d} />

      {actionBar?.(d)}
      {overlays?.(d)}
    </div>
  )
}
