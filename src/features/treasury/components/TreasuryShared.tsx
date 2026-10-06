/**
 * عناصر القاصة المشتركة (00189) — تعمل في بوابتي المدير التنفيذي والمالية:
 *  · فلتر نطاق التاريخ (بداية/نهاية + اختصارات) · بطاقة حركة (موبايل أولاً) · قائمة حركات · تصدير Excel
 *  · الأرقام إنكليزية (0-9) دائماً
 */
import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { EmptyState } from '@components/feedback/EmptyState'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { field, fmtMoney, isoDay, monthStart } from '@portals/hr/components/hr-format'
import { buildExcelReport } from '@lib/export/excel-report'
import { CONFIRM_LABEL, REWARD_TYPE_LABEL, TREASURY_KIND_LABEL, TREASURY_STATUS_LABEL, type TreasuryKind, type TreasuryStatus, type TreasuryTx } from '@sdk/treasury.sdk'

export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
export const IQD = (n: number | null | undefined) => (n == null ? '—' : `${fmtMoney(n)} د.ع`)

export interface DateRange { from: string; to: string }
export const defaultRange = (): DateRange => ({ from: monthStart(), to: isoDay() })

/** فلتر نطاق تاريخ موحّد: من/إلى + اختصارات (هذا الشهر · 3 أشهر · هذه السنة · الكل) */
export function DateRangeFilter({ value, onChange, testId = 'tr-range' }: { value: DateRange; onChange: (v: DateRange) => void; testId?: string }) {
  const today = new Date()
  const y = today.getFullYear()
  const presets: Array<{ k: string; label: string; v: DateRange }> = [
    { k: 'month', label: 'هذا الشهر', v: defaultRange() },
    { k: 'q', label: '3 أشهر', v: { from: isoDay(new Date(y, today.getMonth() - 2, 1)), to: isoDay() } },
    { k: 'year', label: 'هذه السنة', v: { from: `${y}-01-01`, to: isoDay() } },
    { k: 'all', label: 'الكل', v: { from: '', to: '' } },
  ]
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid={testId}>
      <label className="text-xs font-semibold text-slate-600">من<input type="date" className={clsx(field, 'mt-1 w-40')} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} data-testid={`${testId}-from`} /></label>
      <label className="text-xs font-semibold text-slate-600">إلى<input type="date" className={clsx(field, 'mt-1 w-40')} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} data-testid={`${testId}-to`} /></label>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button key={p.k} type="button" onClick={() => onChange(p.v)} data-testid={`${testId}-${p.k}`}
            className={clsx('h-9 rounded-lg border px-2.5 text-xs font-bold', value.from === p.v.from && value.to === p.v.to ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700')}>{p.label}</button>
        ))}
      </div>
    </div>
  )
}

const STATUS_TONE: Record<TreasuryStatus, string> = { pending: 'bg-amber-100 text-amber-800 border-amber-300', confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-300', cancelled: 'bg-slate-100 text-slate-600 border-slate-300' }
const KIND_TONE: Record<TreasuryKind, string> = { receipt: 'text-emerald-700', reward: 'text-violet-700', gps_payment: 'text-sky-700' }

export function StatusPill({ status, needsFinance = true }: { status: TreasuryStatus; needsFinance?: boolean }) {
  const label = status === 'pending' && !needsFinance ? 'مسجَّلة' : status === 'confirmed' && !needsFinance ? 'مسجَّلة' : TREASURY_STATUS_LABEL[status]
  return <span className={clsx('inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-bold', STATUS_TONE[status])}>{label}</span>
}

/** عنوان الحركة للعرض: اسم الحركة (مستحقات/GPS) أو الموظف+نوع المكافأة */
export const txTitle = (t: TreasuryTx) => (t.kind === 'reward' ? `${t.employee_name ?? '—'} · ${t.reward_type ? REWARD_TYPE_LABEL[t.reward_type] : ''}` : t.type_name ?? TREASURY_KIND_LABEL[t.kind])
/** هل للحركة مبلغ يُعرض؟ (المكافآت غير النقدية بلا مبلغ) */
export const txHasAmount = (t: TreasuryTx) => t.kind !== 'reward' || t.reward_type === 'cash'

/** بطاقة حركة — موبايل أولاً؛ الإجراءات تُمرَّر من الصفحة (المالية: تأكيد/إعادة · التنفيذي: إلغاء المعلّق) */
export function TxCard({ tx, actions }: { tx: TreasuryTx; actions?: ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid={`tx-${tx.id}`} data-status={tx.status}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={clsx('text-[11px] font-bold', KIND_TONE[tx.kind])}>{TREASURY_KIND_LABEL[tx.kind]} · <span dir="ltr" className="font-mono">{tx.ref_no}</span></p>
          <h3 className="truncate text-sm font-black text-slate-800">{txTitle(tx)}</h3>
          {tx.kind === 'reward' && tx.employee_number && <p className="text-[11px] text-slate-500">الرقم الوظيفي: <span dir="ltr">{tx.employee_number}</span></p>}
        </div>
        <StatusPill status={tx.status} needsFinance={tx.needs_finance} />
      </div>
      {txHasAmount(tx) && <p className="mt-2 text-lg font-black tabular-nums text-slate-900" dir="ltr" data-testid={`tx-amount-${tx.id}`}>{IQD(tx.amount)}</p>}
      {tx.details && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{tx.details}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500 sm:grid-cols-3">
        <div><dt className="font-semibold">سجّلها</dt><dd className="text-slate-700">{tx.created_by_name ?? '—'}</dd></div>
        <div><dt className="font-semibold">التاريخ والوقت</dt><dd className="text-slate-700">{fmtDateTime(tx.created_at)}</dd></div>
        {tx.status === 'confirmed' && tx.needs_finance && <div><dt className="font-semibold">{CONFIRM_LABEL[tx.kind]}</dt><dd className="text-emerald-700">{tx.confirmed_by_name ?? '—'} · {fmtDateTime(tx.confirmed_at)}</dd></div>}
        {tx.finance_note && <div className="col-span-2 sm:col-span-3"><dt className="font-semibold">ملاحظة المالية</dt><dd className="text-slate-700">{tx.finance_note}</dd></div>}
        {tx.status === 'cancelled' && <div className="col-span-2 sm:col-span-3"><dt className="font-semibold">أُلغيت</dt><dd className="text-red-700">{tx.cancelled_by_name ?? '—'} · {fmtDateTime(tx.cancelled_at)} — {tx.cancel_reason}</dd></div>}
      </dl>
      {actions && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">{actions}</div>}
    </article>
  )
}

export function TxList({ rows, isLoading, empty = 'لا توجد حركات في هذا النطاق', renderActions, testId = 'tx-list' }: { rows: TreasuryTx[]; isLoading?: boolean; empty?: string; renderActions?: (t: TreasuryTx) => ReactNode; testId?: string }) {
  if (isLoading && rows.length === 0) return <LoadingSpinner />
  if (rows.length === 0) return <EmptyState title={empty} />
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3" data-testid={testId}>{rows.map((t) => <TxCard key={t.id} tx={t} actions={renderActions?.(t)} />)}</div>
}

/** حوار سبب (إلغاء/إعادة) مبسّط */
export function ReasonPrompt({ title, confirmLabel, onConfirm, onClose, busy }: { title: string; confirmLabel: string; onConfirm: (reason: string) => void; onClose: () => void; busy?: boolean }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" dir="rtl" data-testid="reason-prompt">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <h3 className="text-sm font-black text-slate-800">{title}</h3>
        <textarea className={clsx(field, 'mt-2 h-24 py-2')} placeholder="اكتب السبب…" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reason-input" />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>إغلاق</Button>
          <Button variant="danger" size="sm" disabled={busy || reason.trim().length < 2} onClick={() => onConfirm(reason.trim())} data-testid="reason-confirm">{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

export async function downloadTreasuryExcel(rows: TreasuryTx[], opts: { title: string; sub: string; fileName: string }) {
  const confirmed = rows.filter((r) => r.status === 'confirmed' && r.affects_balance)
  await buildExcelReport({
    sheetName: 'الحركات', company: 'شركة جزيرة الأكارم', companySub: opts.sub, title: opts.title,
    meta: `أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')} · العملة: دينار عراقي · ${rows.length} حركة`,
    orientation: 'landscape', fileName: opts.fileName,
    columns: [
      { header: 'ت', key: 'i', width: 5, align: 'center' }, { header: 'رقم الحركة', key: 'ref', width: 14, align: 'center' }, { header: 'النوع', key: 'kind', width: 16 },
      { header: 'اسم الحركة / الموظف', key: 'title', width: 30 }, { header: 'نوع المكافأة', key: 'rt', width: 14, align: 'center' },
      { header: 'المبلغ', key: 'amount', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'الحالة', key: 'status', width: 14, align: 'center' },
      { header: 'المنفّذ', key: 'by', width: 18 }, { header: 'التاريخ والوقت', key: 'at', width: 20, align: 'center' },
      { header: 'أكّدته المالية', key: 'cby', width: 18 }, { header: 'وقت التأكيد', key: 'cat', width: 20, align: 'center' }, { header: 'التفاصيل / الملاحظات', key: 'details', width: 32, wrap: true },
    ],
    rows: rows.map((r, i) => ({ i: i + 1, ref: r.ref_no, kind: TREASURY_KIND_LABEL[r.kind], title: txTitle(r), rt: r.reward_type ? REWARD_TYPE_LABEL[r.reward_type] : '', amount: txHasAmount(r) ? r.amount : '', status: TREASURY_STATUS_LABEL[r.status],
      by: r.created_by_name ?? '', at: fmtDateTime(r.created_at), cby: r.confirmed_by_name ?? '', cat: r.confirmed_at ? fmtDateTime(r.confirmed_at) : '', details: [r.details, r.finance_note && `المالية: ${r.finance_note}`, r.cancel_reason && `الإلغاء: ${r.cancel_reason}`].filter(Boolean).join(' · ') })),
    totalRow: { i: 'الإجمالي', title: `${rows.length} حركة`, amount: confirmed.reduce((s, r) => s + (r.kind === 'receipt' ? r.amount : -r.amount), 0), status: 'صافي المؤكَّد' },
  })
}
