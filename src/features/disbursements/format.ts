/** تنسيقات مسار الصرف: الأرقام إنكليزية (0-9) دائماً، والأشهر بأسمائها العراقية */
import { fmtMoney } from '@portals/hr/components/hr-format'
import type { DisbursementRequest } from '@sdk/disbursements.sdk'

const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'] as const

/** «تشرين الثاني 2026» من تاريخ ISO (أي يوم في الشهر) */
export const monthTitle = (iso: string): string => `${AR_MONTHS[Math.min(11, Math.max(0, Number(iso.slice(5, 7)) - 1))]} ${iso.slice(0, 4)}`
/** «38,450,000 د.ع» */
export const iqd = (n: number | null | undefined): string => (n == null ? '—' : `${fmtMoney(n)} د.ع`)
export const money = fmtMoney

/** «قبل 20 دقيقة» · «قبل ساعتين» · «قبل 3 أيام» (عربي بأرقام إنكليزية) */
export function agoAr(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—'
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'الآن'
  if (mins < 60) return mins === 1 ? 'قبل دقيقة' : mins === 2 ? 'قبل دقيقتين' : `قبل ${mins} ${mins <= 10 ? 'دقائق' : 'دقيقة'}`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? 'قبل ساعة' : hours === 2 ? 'قبل ساعتين' : `قبل ${hours} ${hours <= 10 ? 'ساعات' : 'ساعة'}`
  const days = Math.round(hours / 24)
  return days === 1 ? 'قبل يوم' : days === 2 ? 'قبل يومين' : `قبل ${days} ${days <= 10 ? 'أيام' : 'يوماً'}`
}

/** «14:05» بتوقيت بغداد */
export const clock = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' }) : '—'
/** «2026-11-17 · 14:05» بتوقيت بغداد */
export const stamp = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' })} · ${clock(iso)}`
}

/** نسبة التغيّر عن الشهر السابق (null إن لم يوجد سابق أو كان صفراً) — مقرّبة لخانة عشرية */
export function changePct(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || prev <= 0) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}
export const signedPct = (p: number): string => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`

/** «الأحد 2 تشرين الثاني» لسطر يوم (YYYY-MM-DD) في جدول أيام المتعهد */
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const
export const dayLabel = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`
}
/** سبب حجب يوم المتعهد كما يُعرض */
export const blockReasonLabel = (r: string | null | undefined): string =>
  r === 'absent' ? 'غياب البصمة' : r === 'leave' ? 'إجازة معتمدة' : r === 'no_record' ? 'بلا سجل حضور' : r ? 'محجوب' : ''
/** 90 ⇒ «1س 30د» */
export const minutesLabel = (m: number | null | undefined): string => (m == null || m <= 0 ? '0' : m >= 60 ? `${Math.floor(m / 60)}س${m % 60 ? ` ${m % 60}د` : ''}` : `${m}د`)

/** خطوة «قرار المدير المفوض والصرف» في شريط مراحل كشف الرواتب (المالية): ما بعد اعتماد المالية — الطلب يُنشأ آلياً عند الاعتماد */
export function disbursementStep(d: DisbursementRequest | null | undefined, approved: boolean): { hint: string; state: 'done' | 'bad' | 'active' | 'todo' } {
  if (!d) return { hint: approved ? 'لا طلب صرف لهذا الشهر' : 'يُنشأ تلقائياً عند اعتماد المالية', state: 'todo' }
  const no = d.request_no
  if (d.status === 'pending_approval') return { hint: `${no} · بانتظار قرار المدير المفوض`, state: 'active' }
  if (d.status === 'approved') return { hint: `${no} · معتمد — بانتظار الصرف من القاصة`, state: 'active' }
  if (d.status === 'paid') return { hint: `${no} · صُرف من القاصة`, state: 'done' }
  return { hint: `${no} · رفضه المدير المفوض — أعد الإرسال`, state: 'bad' }
}
