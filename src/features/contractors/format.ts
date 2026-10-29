/** تنسيقات مشتركة لبوابة المتعهد وغرفة العمليات */
import { SHIFT_LABELS_LIVE } from '@sdk/hr-shifts.sdk'
/** 00376: أسماء الشفتات من الموارد البشرية (سجل حيّ) */
export const SHIFT_AR: Record<string, string> = SHIFT_LABELS_LIVE
export const PARENT_AR: Record<string, string> = { karrada: 'قاطع الكرادة', zaafaraniya: 'قاطع الزعفرانية' }
export const timeAr = (x: string | null | undefined) =>
  x ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x)) : '—'
export const dateAr = (x: string | null | undefined) =>
  x ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeZone: 'Asia/Baghdad' }).format(new Date(x)) : '—'
export const zoneLabel = (inZone: boolean | null | undefined, defined = true) =>
  !defined || inZone === null || inZone === undefined ? 'لا نطاق محدد للمنطقة' : inZone ? 'داخل نطاق المنطقة' : 'خارج نطاق المنطقة'
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
export const daysInMonth = (monthFirst: string) => { const [y = 2026, m = 1] = monthFirst.split('-').map(Number); return new Date(y, m, 0).getDate() }
