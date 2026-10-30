/** تنسيقات مشتركة لبوابة مسؤول القاطع */
import { parentSectorTitle } from '@sdk/sectors.sdk'
/** 00394: «قاطع …» من السجل الحيّ للقطاعات */
export const PARENT_AR: Record<string, string> = new Proxy({} as Record<string, string>, { get: (_t, k) => (typeof k === 'string' ? parentSectorTitle(k) : undefined) })
import { SHIFT_LABELS_LIVE } from '@sdk/hr-shifts.sdk'
/** 00376: أسماء الشفتات من الموارد البشرية (سجل حيّ) */
export const SHIFT_AR: Record<string, string> = SHIFT_LABELS_LIVE
export const STATUS_AR: Record<string, string> = { waiting: 'بانتظار دوره', pending: 'بانتظار القرار', approved: 'موافقة', rejected: 'رفض', skipped: 'تُخطّيت' }
export const dateAr = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('ar-IQ-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
export const timeAr = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : '—')
export const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
