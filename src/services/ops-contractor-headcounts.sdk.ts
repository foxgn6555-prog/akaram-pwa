/** SDK وحدة «حضوريات العمال» في غرفة العمليات (00262) — الكشف الشهري، التصحيح بسبب، اعتماد الشهر. لا بيانات مالية. */
import { sdkGuard, supabase } from './client'

export type CountSource = 'contractor' | 'follow_up' | 'sector_manager'
export const COUNT_SOURCE_AR: Record<CountSource, string> = { sector_manager: 'القاطع', contractor: 'المتعهد', follow_up: 'المتابعة' }
/** ترتيب الأعمدة كما في كشف الشركة: قاطع · متعهد · متابعة */
export const COUNT_SOURCES: CountSource[] = ['sector_manager', 'contractor', 'follow_up']

export interface HeadcountSheetRow {
  contractor_user_id: string; contractor_name: string; sector_id: number; area_name: string; parent_sector: 'karrada' | 'zaafaraniya'; shift: string | null; is_active: boolean
  log_date: string; checked_in: boolean; in_zone: boolean | null
  contractor_headcount: number | null; follow_up_headcount: number | null; sector_manager_headcount: number | null
  contractor_edit_reason: string | null; follow_up_edit_reason: string | null; sector_manager_edit_reason: string | null
}
export interface MonthStatus {
  month: string; approved: boolean; approved_source: CountSource | null; approved_by_name: string | null; approved_at: string | null; is_locked: boolean
  reopened_by_name: string | null; reopened_at: string | null; reopen_reason: string | null; month_ended: boolean
  contractors: number; days_with_contractor: number; days_with_follow_up: number; days_with_sector_manager: number
}
/** 00303: متعهد × يوم فيه رقم من جهة أخرى ولا رقم من الجهة المختارة — لن يُدفع إن اعتُمدت هذه الجهة */
export interface CoverageGap { contractor_user_id: string; contractor_name: string; area_name: string | null; log_date: string; contractor_count: number | null; follow_up_count: number | null; sector_manager_count: number | null }
export interface HeadcountAudit { id: string; actor_name: string; action: string; contractor_name: string | null; log_date: string | null; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; reason: string | null; created_at: string }

const first = (m: string) => `${m.slice(0, 7)}-01`
export const opsContractorHeadcounts = {
  async sheet(month: string, parent?: 'karrada' | 'zaafaraniya' | null): Promise<HeadcountSheetRow[]> {
    return ((await sdkGuard(supabase.rpc('ops_contractor_headcounts_sheet', { p_month: first(month), p_parent: parent ?? null }))) as HeadcountSheetRow[] | null) ?? []
  },
  async status(month: string): Promise<MonthStatus | null> {
    const rows = (await sdkGuard(supabase.rpc('ops_contractor_month_status', { p_month: first(month) }))) as MonthStatus[] | null
    return rows?.[0] ?? null
  },
  async correct(x: { contractorUserId: string; date: string; source: CountSource; headcount: number; reason: string }): Promise<void> {
    await sdkGuard(supabase.rpc('ops_contractor_count_correct', { p_contractor: x.contractorUserId, p_date: x.date, p_source: x.source, p_headcount: x.headcount, p_reason: x.reason }))
  },
  async coverageGaps(month: string, source: CountSource): Promise<CoverageGap[]> {
    return ((await sdkGuard(supabase.rpc('ops_contractor_coverage_gaps', { p_month: first(month), p_source: source }))) as CoverageGap[] | null) ?? []
  },
  async approve(month: string, source: CountSource, force = false): Promise<void> {
    await sdkGuard(supabase.rpc('ops_contractor_month_approve', { p_month: first(month), p_source: source, p_force: force }))
  },
  async reopen(month: string, reason: string): Promise<void> {
    await sdkGuard(supabase.rpc('ops_contractor_month_reopen', { p_month: first(month), p_reason: reason }))
  },
  async audit(month: string): Promise<HeadcountAudit[]> {
    return ((await sdkGuard(supabase.rpc('ops_contractor_audit', { p_month: first(month) }))) as HeadcountAudit[] | null) ?? []
  },
}
