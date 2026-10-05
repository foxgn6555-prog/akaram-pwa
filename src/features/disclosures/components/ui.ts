/** مساعدات وحدة الكشوفات (تنسيق + أصناف أزرار) — ملف منفصل حفاظاً على Fast Refresh */
import { PENALTY_LABEL, SHIFT_LABEL } from '@sdk/disclosures-unit.sdk'

export const fmtIqd = (n: number | null | undefined): string => (n == null ? '—' : `${new Intl.NumberFormat('en-US').format(n)} د.ع`)
export const fmtDate = (s: string | null | undefined): string => (s ? s.slice(0, 10) : '—')
export const fmtDateTime = (s: string | null | undefined): string => {
  if (!s) return '—'
  const d = new Date(s); if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('ar-IQ-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
export const fmtMonth = (s: string | null | undefined): string => (s ? s.slice(0, 7) : '—')

export function penaltyLabel(k: string | null | undefined): string { return k ? (PENALTY_LABEL[k as keyof typeof PENALTY_LABEL] ?? k) : '—' }
export function shiftLabel(k: string | null | undefined): string { return k ? (SHIFT_LABEL[k] ?? k) : '—' }

export const inputCls = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50'
export const btnPrimary = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-black text-white shadow-sm hover:bg-brand-700 disabled:opacity-50'
export const btnGhost = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
export const btnDanger = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 text-sm font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50'
