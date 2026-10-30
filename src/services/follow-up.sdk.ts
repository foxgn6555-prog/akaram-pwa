/** SDK بوابة المتابعة (00259): نطاق المتابعة من التطوير المركزية + متابعة أعداد عمال المتعهدين. لا بيانات مالية هنا إطلاقاً. */
import { sdkGuard, sdkVoid, supabase } from './client'

/** 00394: رمز القطاع من جدول parent_sectors (ديناميكي) */
export type ParentSector = string
export interface FollowUpProfile { user_id: string; parent_sectors: ParentSector[]; sector_ids: number[]; is_active: boolean; scope_label: string | null; areas_count: number; assigned_at: string }
export interface FollowUpScopeOption { parent_sector: ParentSector; parent_name: string; sector_id: number; area_name: string; contractor_name: string | null }
export interface FollowUpArea { id: number; name: string; parent_sector: ParentSector }
export interface FollowUpMe {
  user_id: string; full_name: string; parent_sectors: ParentSector[]; sector_ids: number[]; areas: FollowUpArea[]; areas_count: number; contractors_count: number
  today: string; today_checked_in: number; today_counted_by_me: number; month_locked: boolean
}
export interface FollowUpContractorRow {
  contractor_user_id: string; contractor_name: string; sector_id: number; area_name: string; parent_sector: ParentSector; shift: string | null
  checked_in: boolean; checkin_at: string | null; in_zone: boolean | null
  contractor_headcount: number | null; my_headcount: number | null; my_updated_at: string | null; editable: boolean
}

export const followUp = {
  // ── التطوير المركزية ──
  async scopeOptions(): Promise<FollowUpScopeOption[]> {
    return ((await sdkGuard(supabase.rpc('follow_up_scope_options'))) as FollowUpScopeOption[] | null) ?? []
  },
  async profileForUser(userId: string): Promise<FollowUpProfile | null> {
    const rows = (await sdkGuard(supabase.rpc('follow_up_profile_for_user', { p_user_id: userId }))) as FollowUpProfile[] | null
    return rows?.[0] ?? null
  },
  async assign(x: { userId: string; parentSectors: ParentSector[]; sectorIds: number[]; notes?: string | null }): Promise<void> {
    await sdkVoid(supabase.rpc('follow_up_assign', { p_user_id: x.userId, p_parent_sectors: x.parentSectors, p_sector_ids: x.sectorIds, p_notes: x.notes ?? null }))
  },
  async unassign(userId: string, reason?: string | null): Promise<void> {
    await sdkVoid(supabase.rpc('follow_up_unassign', { p_user_id: userId, p_reason: reason ?? null }))
  },
  // ── البوابة ──
  async me(): Promise<FollowUpMe | null> {
    const rows = (await sdkGuard(supabase.rpc('follow_up_me'))) as FollowUpMe[] | null
    return rows?.[0] ?? null
  },
  async contractors(date?: string | null): Promise<FollowUpContractorRow[]> {
    return ((await sdkGuard(supabase.rpc('follow_up_contractors', { p_date: date ?? null }))) as FollowUpContractorRow[] | null) ?? []
  },
  async setHeadcount(contractorUserId: string, headcount: number): Promise<void> {
    await sdkVoid(supabase.rpc('follow_up_set_headcount', { p_contractor: contractorUserId, p_headcount: headcount }))
  },
}
