/** منطق مرشّحات الكشوفات (خادم + محلي) ووصفها — بلا React */
import { DISCLOSURE_STATUS_LABEL, type DisclosureListFilter, type DisclosureStatusV2, type DisclosureType, type DisclosureV2 } from '@sdk/disclosures-unit.sdk'

export type AmountFilter = '' | 'with' | 'without' | 'deducted'
export type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'ref_desc' | 'name'
export interface UiFilters { q: string; type: string; status: '' | DisclosureStatusV2; kind: '' | 'vehicle' | 'employee'; month: string; from: string; to: string; sector: string; preparer: string; amount: AmountFilter; sort: SortKey }
export const EMPTY_FILTERS: UiFilters = { q: '', type: '', status: '', kind: '', month: '', from: '', to: '', sector: '', preparer: '', amount: '', sort: 'date_desc' }

/** ما يُرسل للخادم (الباقي يُرشَّح محلياً) */
export function toServerFilter(f: UiFilters): Omit<DisclosureListFilter, 'scope'> {
  return { q: f.q.trim() || null, type: f.type || null, month: f.from || f.to ? null : f.month || null, from: f.from || null, to: f.to || null }
}
export function applyClientFilters(rows: DisclosureV2[], f: UiFilters): DisclosureV2[] {
  let out = rows.filter((d) =>
    (!f.status || d.status === f.status) && (!f.kind || d.target_kind === f.kind) && (!f.sector || (d.sector ?? d.department_name ?? '—') === f.sector) && (!f.preparer || (d.prepared_by_name ?? '—') === f.preparer)
    && (f.amount === '' || (f.amount === 'with' ? (d.amount ?? 0) > 0 : f.amount === 'without' ? !(d.amount && d.amount > 0) : d.deduction_posted)))
  const by: Record<SortKey, (a: DisclosureV2, b: DisclosureV2) => number> = {
    date_desc: (a, b) => b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at), date_asc: (a, b) => a.log_date.localeCompare(b.log_date),
    amount_desc: (a, b) => (b.amount ?? -1) - (a.amount ?? -1), ref_desc: (a, b) => (b.ref_no ?? '').localeCompare(a.ref_no ?? ''), name: (a, b) => (a.target_kind === 'vehicle' ? a.driver_name : a.employee_name ?? '').localeCompare(b.target_kind === 'vehicle' ? b.driver_name : b.employee_name ?? '', 'ar'),
  }
  out = [...out].sort(by[f.sort])
  return out
}
export function filtersSummary(f: UiFilters, types: DisclosureType[] = []): string[] {
  const s: string[] = []
  if (f.q.trim()) s.push(`بحث: ${f.q.trim()}`)
  if (f.type) s.push(`النوع: ${types.find((t) => t.key === f.type)?.label ?? f.type}`)
  if (f.status) s.push(`الحالة: ${DISCLOSURE_STATUS_LABEL[f.status]}`)
  if (f.kind) s.push(`الهدف: ${f.kind === 'vehicle' ? 'آليات' : 'موظفون'}`)
  if (f.from || f.to) s.push(`الفترة: ${f.from || '…'} → ${f.to || '…'}`); else if (f.month) s.push(`الشهر: ${f.month}`)
  if (f.sector) s.push(`القاطع/القسم: ${f.sector}`)
  if (f.preparer) s.push(`مُعدّ الكشف: ${f.preparer}`)
  if (f.amount) s.push(f.amount === 'with' ? 'بمبلغ' : f.amount === 'without' ? 'بدون مبلغ' : 'استقطاع مُسجَّل')
  return s
}
