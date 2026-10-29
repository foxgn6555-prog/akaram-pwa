/** 00262 — تحويل صفوف الكشف إلى الشكل المعتمد في الشركة: صفوف = أيام الشهر، لكل متعهد ثلاثة أعمدة (قاطع/متعهد/متابعة)، ومجاميع كل شفت موجود (00376: شفتات HR ديناميكية). */
import { COUNT_SOURCES, type CountSource, type HeadcountSheetRow } from '@sdk/ops-contractor-headcounts.sdk'

export interface PivotContractor { id: string; name: string; area: string; parent: 'karrada' | 'zaafaraniya'; shift: string | null; isActive: boolean }
export interface PivotCell { value: number | null; reason: string | null; checkedIn: boolean; inZone: boolean | null }
export interface PivotDay { date: string; cells: Record<string, Record<CountSource, PivotCell>>; shiftTotals: Record<string, Record<CountSource, number>>; total: Record<CountSource, number> }
export interface Pivot { contractors: PivotContractor[]; /** رموز الشفتات الموجودة بين المتعهدين بترتيب القائمة */ shifts: string[]; days: PivotDay[]; contractorTotals: Record<string, Record<CountSource, number>>; grand: Record<CountSource, number>; sources: CountSource[] }

const zero = (): Record<CountSource, number> => ({ sector_manager: 0, contractor: 0, follow_up: 0 })
const valueOf = (r: HeadcountSheetRow, s: CountSource) => (s === 'contractor' ? r.contractor_headcount : s === 'follow_up' ? r.follow_up_headcount : r.sector_manager_headcount)
const reasonOf = (r: HeadcountSheetRow, s: CountSource) => (s === 'contractor' ? r.contractor_edit_reason : s === 'follow_up' ? r.follow_up_edit_reason : r.sector_manager_edit_reason)

/** @param sourceFilter 'all' = الأعمدة الثلاثة؛ وإلا عمود واحد لكل متعهد */
export function buildPivot(rows: HeadcountSheetRow[], sourceFilter: CountSource | 'all' = 'all', shiftOrder: readonly string[] = ['morning', 'evening', 'night']): Pivot {
  const sources = sourceFilter === 'all' ? COUNT_SOURCES : [sourceFilter]
  const cmap = new Map<string, PivotContractor>()
  for (const r of rows) if (!cmap.has(r.contractor_user_id)) cmap.set(r.contractor_user_id, { id: r.contractor_user_id, name: r.contractor_name, area: r.area_name, parent: r.parent_sector, shift: r.shift, isActive: r.is_active })
  const contractors = Array.from(cmap.values())
  const rank = (c: string) => { const i = shiftOrder.indexOf(c); return i < 0 ? shiftOrder.length : i }
  const shifts = Array.from(new Set(contractors.map((c) => c.shift).filter((x): x is string => !!x))).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const dates = Array.from(new Set(rows.map((r) => r.log_date))).sort()
  const contractorTotals: Record<string, Record<CountSource, number>> = Object.fromEntries(contractors.map((c) => [c.id, zero()]))
  const grand = zero()
  const days: PivotDay[] = dates.map((date) => {
    const cells: PivotDay['cells'] = {}
    const shiftTotals: Record<string, Record<CountSource, number>> = Object.fromEntries(shifts.map((x) => [x, zero()]))
    const total = zero()
    for (const r of rows) {
      if (r.log_date !== date) continue
      const cell = {} as Record<CountSource, PivotCell>
      for (const s of COUNT_SOURCES) {
        const v = valueOf(r, s)
        cell[s] = { value: v, reason: reasonOf(r, s), checkedIn: r.checked_in, inZone: r.in_zone }
        if (v != null) {
          total[s] += v; grand[s] += v; contractorTotals[r.contractor_user_id]![s] += v
          const st = r.shift ? shiftTotals[r.shift] : undefined
          if (st) st[s] += v
        }
      }
      cells[r.contractor_user_id] = cell
    }
    return { date, cells, shiftTotals, total }
  })
  return { contractors, shifts, days, contractorTotals, grand, sources }
}

/** عدد العمال من العدد المسجّل (العدد يشمل المتعهد) */
export const workersOf = (v: number | null) => (v == null ? null : Math.max(0, v - 1))
