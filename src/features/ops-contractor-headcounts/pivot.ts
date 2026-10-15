/** 00262 — تحويل صفوف الكشف إلى الشكل المعتمد في الشركة: صفوف = أيام الشهر، لكل متعهد ثلاثة أعمدة (قاطع/متعهد/متابعة)، ومجاميع الشفتين. */
import { COUNT_SOURCES, type CountSource, type HeadcountSheetRow } from '@sdk/ops-contractor-headcounts.sdk'

export interface PivotContractor { id: string; name: string; area: string; parent: 'karrada' | 'zaafaraniya'; shift: string | null; isActive: boolean }
export interface PivotCell { value: number | null; reason: string | null; checkedIn: boolean; inZone: boolean | null }
export interface PivotDay { date: string; cells: Record<string, Record<CountSource, PivotCell>>; shiftTotals: Record<'morning' | 'evening', Record<CountSource, number>>; total: Record<CountSource, number> }
export interface Pivot { contractors: PivotContractor[]; days: PivotDay[]; contractorTotals: Record<string, Record<CountSource, number>>; grand: Record<CountSource, number>; sources: CountSource[] }

const zero = (): Record<CountSource, number> => ({ sector_manager: 0, contractor: 0, follow_up: 0 })
const valueOf = (r: HeadcountSheetRow, s: CountSource) => (s === 'contractor' ? r.contractor_headcount : s === 'follow_up' ? r.follow_up_headcount : r.sector_manager_headcount)
const reasonOf = (r: HeadcountSheetRow, s: CountSource) => (s === 'contractor' ? r.contractor_edit_reason : s === 'follow_up' ? r.follow_up_edit_reason : r.sector_manager_edit_reason)

/** @param sourceFilter 'all' = الأعمدة الثلاثة؛ وإلا عمود واحد لكل متعهد */
export function buildPivot(rows: HeadcountSheetRow[], sourceFilter: CountSource | 'all' = 'all'): Pivot {
  const sources = sourceFilter === 'all' ? COUNT_SOURCES : [sourceFilter]
  const cmap = new Map<string, PivotContractor>()
  for (const r of rows) if (!cmap.has(r.contractor_user_id)) cmap.set(r.contractor_user_id, { id: r.contractor_user_id, name: r.contractor_name, area: r.area_name, parent: r.parent_sector, shift: r.shift, isActive: r.is_active })
  const contractors = Array.from(cmap.values())
  const dates = Array.from(new Set(rows.map((r) => r.log_date))).sort()
  const contractorTotals: Record<string, Record<CountSource, number>> = Object.fromEntries(contractors.map((c) => [c.id, zero()]))
  const grand = zero()
  const days: PivotDay[] = dates.map((date) => {
    const cells: PivotDay['cells'] = {}
    const shiftTotals = { morning: zero(), evening: zero() }
    const total = zero()
    for (const r of rows) {
      if (r.log_date !== date) continue
      const cell = {} as Record<CountSource, PivotCell>
      for (const s of COUNT_SOURCES) {
        const v = valueOf(r, s)
        cell[s] = { value: v, reason: reasonOf(r, s), checkedIn: r.checked_in, inZone: r.in_zone }
        if (v != null) {
          total[s] += v; grand[s] += v; contractorTotals[r.contractor_user_id]![s] += v
          if (r.shift === 'morning' || r.shift === 'evening') shiftTotals[r.shift][s] += v
        }
      }
      cells[r.contractor_user_id] = cell
    }
    return { date, cells, shiftTotals, total }
  })
  return { contractors, days, contractorTotals, grand, sources }
}

/** عدد العمال من العدد المسجّل (العدد يشمل المتعهد) */
export const workersOf = (v: number | null) => (v == null ? null : Math.max(0, v - 1))
