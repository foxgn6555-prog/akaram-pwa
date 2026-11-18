/**
 * قائمة طلبات الصرف — مشتركة بين بوابة المدير المفوض (/admin/disbursements) وبوابة المالية (/finance/disbursements).
 *  · رأس بأربعة أرقام حيّة · مرشّحات: النوع · الحالة (بعدّاداتها) · الشهر · البحث برقم الطلب
 *  · بطاقة لكل طلب بالمبلغ الكبير وسطر الملخص وزر «معاينة وقرار» (المدير) / «أمر الصرف» (المالية)
 *  · الواقع لا يُخفى: مرفوض أُعيد إرساله يظهر بإشارة إلى نسخته الجديدة ولا يُحتسب «يحتاج إجراء»
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { EmptyState } from '@components/feedback/EmptyState'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { DISBURSEMENT_KIND_LABEL, type DisbursementKind, type DisbursementRequest, type DisbursementStatus } from '@sdk/disbursements.sdk'
import { useDisbursementList } from '../hooks'
import { agoAr, monthTitle } from '../format'
import { AmountBig, FilterChip, KindChip, StatusChip, btnPrimary } from './DisbursementUi'

export type DisbursementPortal = 'admin' | 'finance'
type StatusFilter = DisbursementStatus | 'all'

const STATUS_CHIPS: Record<DisbursementPortal, ReadonlyArray<{ key: StatusFilter; label: string }>> = {
  admin: [{ key: 'pending_approval', label: 'بانتظار قراري' }, { key: 'approved', label: 'معتمد' }, { key: 'paid', label: 'مصروف' }, { key: 'rejected', label: 'مرفوض' }, { key: 'all', label: 'الكل' }],
  finance: [{ key: 'approved', label: 'بانتظار الصرف' }, { key: 'pending_approval', label: 'بانتظار قرار المدير' }, { key: 'rejected', label: 'مرفوض' }, { key: 'paid', label: 'مصروف' }, { key: 'all', label: 'الكل' }],
}

/** سطر الملخص أسفل المبلغ: عدد الأشخاص + ما جرى للطلب ومتى؛ وللمتعهدين الأيام المحجوبة بالبصمة مبرزة */
function summaryLine(r: DisbursementRequest): { text: string; warn?: string } {
  const who = r.kind === 'employee_payroll' ? `${fmtMoney(r.people_count)} موظفاً` : `${fmtMoney(r.people_count)} متعهداً`
  const sender = r.kind === 'employee_payroll' ? 'أقفلته' : 'أرسلته'
  const what = r.status === 'pending_approval' ? `${sender} الشؤون المالية ${agoAr(r.requested_at)}`
    : r.status === 'approved' ? `اعتمده المدير المفوض ${agoAr(r.decided_at)}`
      : r.status === 'paid' ? `صُرف ${agoAr(r.paid_at)}` : `رفضه المدير المفوض ${agoAr(r.decided_at)}`
  const warn = r.kind === 'contractor_wages' && (r.blocked_days ?? 0) > 0 ? `${fmtMoney(r.blocked_days)} ${(r.blocked_days ?? 0) === 1 ? 'يوم محجوب' : 'أيام محجوبة'} بسبب البصمة` : undefined
  return { text: `${who} · ${what}`, warn }
}

export function DisbursementsListView({ portal }: { portal: DisbursementPortal }) {
  const basePath = portal === 'admin' ? '/admin/disbursements' : '/finance/disbursements'
  const [kind, setKind] = useState<DisbursementKind | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>(portal === 'admin' ? 'pending_approval' : 'all')
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t) }, [search])

  const list = useDisbursementList({ kind: kind === 'all' ? null : kind, status: status === 'all' ? null : status, month: month || null, search: q || null })
  const counts = list.data?.counts
  const balance = list.data?.balance

  // أول تحميل للمدير: لا طلبات بانتظار قراره ⇒ نعرض الكل بدل شاشة فارغة توهم بعدم وجود شيء (مرة واحدة فقط)
  const autoSwitched = useRef(false)
  useEffect(() => {
    if (autoSwitched.current || !counts) return
    autoSwitched.current = true
    if (portal === 'admin' && status === 'pending_approval' && counts.pending_approval === 0 && counts.approved + counts.paid + counts.rejected > 0) setStatus('all')
    if (portal === 'finance' && status === 'all' && counts.approved > 0) setStatus('approved')
  }, [counts, portal, status])

  const openRejected = counts?.rejected_open ?? 0
  const stats = portal === 'admin'
    ? [
      { label: 'بانتظار قرارك', value: counts?.pending_approval ?? '—', tone: 'gold' as const, testId: 'disb-stat-pending' },
      { label: 'معتمدة وبانتظار الصرف', value: counts?.approved ?? '—', tone: 'plain' as const, testId: 'disb-stat-approved' },
      { label: 'مصروفة', value: counts?.paid ?? '—', tone: 'green' as const, testId: 'disb-stat-paid' },
      { label: 'رصيد القاصة (د.ع)', value: balance == null ? '—' : fmtMoney(balance), tone: (balance ?? 0) < 0 ? 'red' as const : 'plain' as const, testId: 'disb-stat-balance' },
    ]
    : [
      { label: 'بانتظار صرفك', value: counts?.approved ?? '—', tone: 'gold' as const, testId: 'disb-stat-approved' },
      { label: 'بانتظار قرار المدير', value: counts?.pending_approval ?? '—', tone: 'plain' as const, testId: 'disb-stat-pending' },
      { label: 'مرفوض — يلزم إعادة الإرسال', value: counts ? openRejected : '—', tone: openRejected > 0 ? 'red' as const : 'plain' as const, testId: 'disb-stat-rejected' },
      { label: 'رصيد القاصة (د.ع)', value: balance == null ? '—' : fmtMoney(balance), tone: (balance ?? 0) < 0 ? 'red' as const : 'green' as const, testId: 'disb-stat-balance' },
    ]
  const chipCount = (k: StatusFilter): number | undefined => {
    if (!counts || k === 'all') return undefined
    const n = k === 'rejected' ? counts.rejected : counts[k]
    return n > 0 ? n : undefined
  }

  return (
    <div className="space-y-3 pb-4" data-testid={`${portal}-disbursements-page`}>
      <ExecPageHeader icon="wallet" title={portal === 'admin' ? 'طلبات الصرف' : 'أوامر الصرف'}
        subtitle={portal === 'admin' ? 'رواتب الموظفين وأجور المتعهدين بعد إقفال الشهر — تقرّر هنا ثم تصرفها الشؤون المالية من القاصة' : 'ما اعتمده المدير المفوض من رواتب وأجور — تصرفه من القاصة بحركة واحدة نهائية لكل طلب'}
        stats={stats} testId="disb-header" />

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm" aria-label="مرشّحات الطلبات" data-testid="disb-filters">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="نوع الطلب">
          <FilterChip active={kind === 'all'} onClick={() => setKind('all')} testId="disb-kind-all">الكل</FilterChip>
          {(['employee_payroll', 'contractor_wages'] as const).map((k) => <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} testId={`disb-kind-${k}`}>{DISBURSEMENT_KIND_LABEL[k]}</FilterChip>)}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="حالة الطلب">
          {STATUS_CHIPS[portal].map((c) => <FilterChip key={c.key} active={status === c.key} onClick={() => setStatus(c.key)} count={chipCount(c.key)} testId={`disb-status-${c.key}`}>{c.label}</FilterChip>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-[10px] font-extrabold text-slate-500">الشهر
            <span className="mt-0.5 flex gap-1">
              <input type="month" className={`${field} min-w-0 font-bold`} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر" data-testid="disb-month" />
              {month && <button type="button" onClick={() => setMonth('')} className="h-10 shrink-0 rounded-xl border border-slate-300 px-2 text-[11px] font-black text-slate-600" data-testid="disb-month-clear" aria-label="كل الأشهر">كل الأشهر</button>}
            </span>
          </label>
          <label className="min-w-0 text-[10px] font-extrabold text-slate-500">بحث
            <input type="search" inputMode="search" className={`${field} mt-0.5 font-bold`} placeholder="رقم الطلب DSB-…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث برقم الطلب" data-testid="disb-search" dir="ltr" />
          </label>
        </div>
      </section>

      {list.isLoading && !list.data ? <LoadingSpinner /> : list.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert" data-testid="disb-list-error">
          تعذّر تحميل الطلبات. <button type="button" className="font-black underline" onClick={() => void list.refetch()}>إعادة المحاولة</button>
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="لا توجد طلبات صرف بهذه المرشّحات" hint="يُنشأ طلب الرواتب تلقائياً عند إقفال الشهر، وطلب أجور المتعهدين عند «اعتماد وإرسال» من الشؤون المالية." />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3" data-testid="disb-list">
          {list.data!.items.map((r) => <li key={r.id}><RequestCard r={r} portal={portal} to={`${basePath}/${r.id}`} /></li>)}
        </ul>
      )}
    </div>
  )
}

function RequestCard({ r, portal, to }: { r: DisbursementRequest; portal: DisbursementPortal; to: string }) {
  const s = summaryLine(r)
  const cta = portal === 'admin' ? (r.status === 'pending_approval' ? 'معاينة وقرار' : 'عرض الطلب') : r.status === 'approved' ? 'صرف من القاصة' : r.status === 'rejected' && !r.resubmitted_id ? 'مراجعة وإعادة إرسال' : 'عرض أمر الصرف'
  return (
    <article className="flex h-full flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid={`disb-card-${r.id}`} data-status={r.status} data-kind={r.kind}>
      <div className="flex items-center justify-between gap-2"><KindChip kind={r.kind} /><StatusChip status={r.status} testId={`disb-card-status-${r.id}`} /></div>
      <h3 className="text-[15px] font-black text-slate-900">{monthTitle(r.period_month)}
        <small className="ms-1.5 text-[11px] font-bold text-slate-500"><bdi dir="ltr">{r.request_no}</bdi>{r.version > 1 ? ` · النسخة ${r.version}` : ''}</small>
      </h3>
      <AmountBig value={r.net_total} size="lg" testId={`disb-card-amount-${r.id}`} />
      <p className="text-[11px] leading-relaxed text-slate-600">{s.text}{s.warn && <> · <b className="font-extrabold text-amber-700" data-testid={`disb-card-blocked-${r.id}`}>{s.warn}</b></>}</p>
      {r.status === 'rejected' && r.decision_note && <p className="line-clamp-2 text-[11px] leading-relaxed text-red-700">السبب: {r.decision_note}</p>}
      {r.status === 'rejected' && r.resubmitted_id && <p className="text-[11px] font-extrabold text-emerald-700" data-testid={`disb-card-resubmitted-${r.id}`}>أُعيد إرساله: النسخة {r.resubmitted_version} <bdi dir="ltr">({r.resubmitted_no})</bdi></p>}
      <div className="mt-auto pt-1.5"><Link to={to} className={`${btnPrimary} w-full`} data-testid={`disb-open-${r.id}`}>{cta}</Link></div>
    </article>
  )
}
