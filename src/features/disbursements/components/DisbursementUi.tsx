/**
 * عناصر واجهة مسار الصرف المشتركة (بوابة المدير المفوض + بوابة المالية) — موبايل أولاً:
 *  · شارات الحالة والنوع · بطاقة رقم · ورقة سفلية (Sheet) للتأكيد والرفض · شريط إجراء ملصق أسفل الشاشة · شريحة مرشّح
 *  · الأرقام إنكليزية (0-9) دائماً · أهداف لمس لا تقل عن 44px
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import { DISBURSEMENT_KIND_LABEL, DISBURSEMENT_STATUS_LABEL, DISBURSEMENT_STATUS_SHORT, type DisbursementKind, type DisbursementStatus } from '@sdk/disbursements.sdk'

const STATUS_TONE: Record<DisbursementStatus, string> = {
  pending_approval: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  paid: 'border-slate-300 bg-slate-100 text-slate-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
}
export function StatusChip({ status, long = false, testId }: { status: DisbursementStatus; long?: boolean; testId?: string }) {
  return (
    <span className={clsx('inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black', STATUS_TONE[status])} data-testid={testId} data-status={status}>
      {long ? DISBURSEMENT_STATUS_LABEL[status] : DISBURSEMENT_STATUS_SHORT[status]}
    </span>
  )
}

const KIND_TONE: Record<DisbursementKind, string> = {
  employee_payroll: 'border-blue-200 bg-blue-50 text-blue-700',
  contractor_wages: 'border-violet-200 bg-violet-50 text-violet-700',
}
export function KindChip({ kind }: { kind: DisbursementKind }) {
  return <span className={clsx('inline-flex shrink-0 items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-black', KIND_TONE[kind])} data-kind={kind}>{DISBURSEMENT_KIND_LABEL[kind]}</span>
}

/** مبلغ كبير بالدينار: الرقم يسار-يمين دائماً حتى لا ينقلب في السياق العربي */
export function AmountBig({ value, size = 'lg', testId, tone = 'navy' }: { value: number; size?: 'md' | 'lg' | 'xl'; testId?: string; tone?: 'navy' | 'red' | 'green' }) {
  const sz = size === 'xl' ? 'text-[1.9rem] leading-tight' : size === 'lg' ? 'text-[1.55rem] leading-tight' : 'text-lg leading-snug'
  const color = tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : 'text-[#0b3d6b]'
  return (
    <p className={clsx('font-black tabular-nums', sz, color)} data-testid={testId}>
      <bdi dir="ltr">{new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}</bdi>
      <span className="ms-1.5 text-xs font-extrabold text-slate-500">د.ع</span>
    </p>
  )
}

const KPI_TONE = {
  plain: 'border-slate-200 bg-slate-50 text-slate-900', red: 'border-slate-200 bg-slate-50 text-red-700', amber: 'border-slate-200 bg-slate-50 text-amber-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800', bad: 'border-red-200 bg-red-50 text-red-800',
} as const
export function Kpi({ label, value, tone = 'plain', testId }: { label: string; value: ReactNode; tone?: keyof typeof KPI_TONE; testId?: string }) {
  return (
    <div className={clsx('min-w-0 rounded-xl border px-2.5 py-1.5', KPI_TONE[tone])} data-testid={testId}>
      <dt className="text-[10px] font-extrabold leading-snug opacity-80">{label}</dt>
      <dd className="text-sm font-black leading-snug tabular-nums"><bdi dir="ltr">{value}</bdi></dd>
    </div>
  )
}
/** كابسولة نصية داخل سطر (استقطاع/سلفة/محجوب...) */
export function Tag({ tone, children }: { tone: 'amber' | 'red' | 'blue' | 'slate'; children: ReactNode }) {
  const t = { amber: 'border-amber-200 bg-amber-50 text-amber-700', red: 'border-red-200 bg-red-50 text-red-700', blue: 'border-blue-200 bg-blue-50 text-blue-700', slate: 'border-slate-300 bg-slate-100 text-slate-600' }[tone]
  // inline-block لا inline-flex: في الفلكس تُحذف المسافات حول العناصر المضمَّنة فيلتصق الرقم بالنص (قيس بمعاينة حية)
  return <span className={clsx('inline-block rounded-md border px-1.5 py-px text-[10px] font-extrabold leading-snug', t)}>{children}</span>
}

/** شريحة مرشّح مع عدّاد اختياري */
export function FilterChip({ active, onClick, children, count, testId }: { active: boolean; onClick: () => void; children: ReactNode; count?: number; testId?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} data-testid={testId}
      className={clsx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-extrabold transition-colors',
        active ? 'border-transparent bg-gradient-to-l from-[#0b3d6b] to-[#0b4f8a] text-white' : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200')}>
      {children}
      {count != null && <b className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/25' : 'bg-slate-200 text-slate-600')}>{count}</b>}
    </button>
  )
}

/** تنبيه ملوّن داخل الصفحة */
export function Alert({ tone, title, children, testId }: { tone: 'red' | 'green' | 'amber' | 'slate'; title?: string; children: ReactNode; testId?: string }) {
  const t = { red: 'border-red-200 bg-red-50 text-red-900', green: 'border-emerald-200 bg-emerald-50 text-emerald-900', amber: 'border-amber-200 bg-amber-50 text-amber-900', slate: 'border-slate-200 bg-white text-slate-700' }[tone]
  return (
    <div className={clsx('rounded-xl border px-3 py-2.5 text-xs leading-relaxed', t)} role={tone === 'red' ? 'alert' : 'status'} data-testid={testId}>
      {title && <b className="font-black">{title} </b>}{children}
    </div>
  )
}

/**
 * شريط إجراء ملصق أسفل المحتوى.
 * ملاحظة قياس (مُتحقَّق منها بمعاينة حية): إزاحة `bottom` للعنصر الملصق تُقاس من داخل حشو منطقة التمرير، لا من حافة الشاشة.
 * منطقة التمرير في AppShell لها حشو سفلي 5.5rem (+ المنطقة الآمنة) على الموبايل/اللوح، والشريط السفلي للتنقل ≈3.7rem (+ المنطقة الآمنة)؛
 * فالإزاحة الصحيحة لالتصاقه فوق الشريط السفلي بلا فجوة هي −2rem (المنطقة الآمنة تُلغي نفسها). وعلى الشاشة الكبيرة (حشو 1.5rem بلا شريط سفلي)
 * يبقى بطاقةً عائمة بالإزاحة 0. إن تغيّر حشو AppShell فيجب تعديل هذه القيمة (راجع tests/contract/action-bar-docking.test.ts).
 */
export function ActionBar({ children, testId = 'disb-action-bar' }: { children: ReactNode; testId?: string }) {
  return (
    <div className="sticky -bottom-8 z-20 -mx-4 mt-4 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-3"
      data-testid={testId}>
      <div className="mx-auto flex w-full max-w-3xl gap-2">{children}</div>
    </div>
  )
}

const BTN = 'inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-55'
export const btnPrimary = clsx(BTN, 'bg-gradient-to-l from-[#0b3d6b] to-[#0b4f8a] text-white shadow-md shadow-[#0b3d6b]/25 hover:brightness-110')
export const btnOk = clsx(BTN, 'bg-emerald-700 text-white shadow-md shadow-emerald-800/25 hover:bg-emerald-600')
export const btnGhost = clsx(BTN, 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
export const btnDangerOutline = clsx(BTN, 'border-[1.5px] border-red-300 bg-white text-red-700 hover:bg-red-50')
export const btnDanger = clsx(BTN, 'bg-red-700 text-white shadow-md shadow-red-800/25 hover:bg-red-600')

/**
 * ورقة سفلية (موبايل) / نافذة وسطية (شاشة كبيرة): Escape والنقر خارجها يغلقانها ما لم يكن هناك طلب جارٍ.
 */
export function Sheet({ title, onClose, busy = false, children, testId = 'disb-sheet' }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode; testId?: string }) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    // التركيز على أول حقل نص إن وُجد، وإلا على أول زر
    ;(el?.querySelector<HTMLElement>('textarea, input') ?? el?.querySelector<HTMLElement>('button:not([disabled])'))?.focus()
    return () => prev?.focus?.()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 sm:items-center sm:p-4" dir="rtl" data-testid={`${testId}-backdrop`}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2.5 shadow-2xl sm:rounded-3xl sm:pb-5">
        <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-300 sm:hidden" aria-hidden />
        <h2 id={titleId} className="text-base font-black text-[#0b3d6b]">{title}</h2>
        {children}
      </div>
    </div>
  )
}
