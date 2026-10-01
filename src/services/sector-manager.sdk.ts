/** SDK مسؤول القاطع (00160) + سلاسل الموافقات. لا بيانات مالية هنا إطلاقاً. */
import { sdkGuard, supabase } from './client'

export type ParentSector = 'karrada' | 'zaafaraniya'
export interface SectorManagerOption { parent_sector: ParentSector; name: string; areas: number; department_managers: number; sector_managers: { user_id: string; name: string }[] }
export interface SectorManagerProfile { user_id: string; parent_sectors: ParentSector[]; parent_names: string[]; notes: string | null; updated_at: string }
export interface SectorManagerMe { user_id: string; full_name: string; parent_sectors: ParentSector[]; parent_names: string[]; areas: number; department_managers: number; contractors: number; employee_id: string | null; has_employee: boolean }
export interface TeamArea { id: number; name: string; contractor_user_id: string | null; contractor_name: string | null; checked_in: boolean; in_zone: boolean | null; workers: number; present: number; absent: number }
export interface SectorTeamRow {
  manager_user_id: string; manager_name: string; manager_phone: string | null; shift: string; parent_sector: ParentSector; areas: TeamArea[]
  contractors: number; workers: number; present_today: number; absent_today: number; presence_proved: number; out_of_zone: number; vehicles_now: number; on_leave_today: boolean
}
export interface SectorDashboard {
  parent_sectors: { code: ParentSector; name: string }[]; areas: number; department_managers: number; contractors: number; areas_without_contractor: number; workers: number
  present_today: number; absent_today: number; presence_proved: number; out_of_zone: number; vehicles_now: number; pending_requests: number; managers_on_leave: number; notices_sent: number
  areas_detail: { id: number; name: string; parent_sector: ParentSector; manager_name: string | null; contractor_name: string | null; checked_in: boolean; in_zone: boolean | null; present: number; absent: number; vehicles_now: number }[]
}
export interface SectorReports {
  from: string; to: string; days: number
  totals: { present: number; absent: number; presence_proofs: number; out_of_zone: number; trips: number; manager_leaves: number }
  series: { d: string; present: number; absent: number; proofs: number }[]
  contractors: { user_id: string; name: string; area: string; parent_sector: ParentSector; manager_name: string; shift: string; workers: number; present: number; absent: number; proof_days: number; out_of_zone_days: number }[]
  managers: { user_id: string; name: string; shift: string; parent_sector: ParentSector; areas: string; contractors: number; present: number; absent: number; trips: number; leave_days: number; permits: number }[]
}
export interface NotifyTarget { user_id: string; full_name: string; parent_sector: ParentSector; areas: string; shift: string }
export interface SectorNotice { id: string; title: string; body: string; recipients_count: number; recipient_names: string; created_at: string }

export type ApprovalStep = { kind: 'hierarchy'; role: string; label?: string } | { kind: 'account'; user_id: string; label?: string }
export type ApprovalRequestType = 'leave' | 'time_permit'
export interface ApprovalChain { id: string; requester_role: string; requester_label: string; request_type: ApprovalRequestType; steps: ApprovalStep[]; is_active: boolean; updated_at: string; updated_by_name: string | null }
export interface ApprovalTask {
  task_id: string; request_kind: ApprovalRequestType; request_id: string; step_no: number; total_steps: number; step_label: string
  requester_user_id: string; requester_name: string; requester_role: string; requester_role_label: string; area_name: string | null; parent_sector: string | null
  type_name: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null; days: number; minutes: number; notes: string | null; attachment_path: string | null; created_at: string
  previous_steps: { step_no: number; label: string; status: string; decided_by: string | null; decided_at: string | null; note: string | null }[]
}
export interface ApprovalTimelineRow { step_no: number; step_label: string; status: 'waiting' | 'pending' | 'approved' | 'rejected' | 'skipped'; approvers: { user_id: string; name: string }[]; decided_by_name: string | null; decided_at: string | null; note: string | null }

const one = <T>(rows: unknown): T | null => (Array.isArray(rows) ? ((rows[0] as T) ?? null) : ((rows as T) ?? null))

export const sectorManager = {
  // التطوير المركزية
  options: async () => (await sdkGuard(supabase.rpc('sector_manager_options'))) as SectorManagerOption[],
  profileForUser: async (userId: string) => one<SectorManagerProfile>(await sdkGuard(supabase.rpc('sector_manager_profile_for_user', { p_user_id: userId }))),
  saveProfile: async (userId: string, parentSectors: ParentSector[], notes?: string | null) =>
    sdkGuard(supabase.rpc('sector_manager_profile_save', { p_user_id: userId, p_parent_sectors: parentSectors, p_notes: notes ?? null })),
  // البوابة
  me: async () => one<SectorManagerMe>(await sdkGuard(supabase.rpc('sector_manager_me'))),
  team: async () => (await sdkGuard(supabase.rpc('sector_manager_team'))) as SectorTeamRow[],
  dashboard: async () => (await sdkGuard(supabase.rpc('sector_manager_dashboard'))) as SectorDashboard,
  reports: async (from?: string, to?: string) => (await sdkGuard(supabase.rpc('sector_manager_reports', { p_from: from ?? null, p_to: to ?? null }))) as SectorReports,
  notifyTargets: async () => (await sdkGuard(supabase.rpc('sector_manager_notify_targets'))) as NotifyTarget[],
  notify: async (title: string, body: string, targets?: string[]) => (await sdkGuard(supabase.rpc('sector_manager_notify', { p_title: title, p_body: body, p_targets: targets && targets.length ? targets : null }))) as number,
  notices: async () => (await sdkGuard(supabase.rpc('sector_manager_notices'))) as SectorNotice[],
}

export const approvals = {
  chains: async () => (await sdkGuard(supabase.rpc('approval_chains_list'))) as ApprovalChain[],
  saveChain: async (requesterRole: string, requestType: ApprovalRequestType, steps: ApprovalStep[], active = true) =>
    (await sdkGuard(supabase.rpc('approval_chain_save', { p_requester_role: requesterRole, p_request_type: requestType, p_steps: steps.map((s) => (s.kind === 'hierarchy' ? { kind: 'hierarchy', role: s.role } : { kind: 'account', user_id: s.user_id })), p_active: active }))) as string,
  deleteChain: async (id: string) => sdkGuard(supabase.rpc('approval_chain_delete', { p_id: id })),
  myTasks: async () => (await sdkGuard(supabase.rpc('approval_my_tasks'))) as ApprovalTask[],
  timeline: async (kind: ApprovalRequestType, requestId: string) => (await sdkGuard(supabase.rpc('approval_timeline', { p_kind: kind, p_request: requestId }))) as ApprovalTimelineRow[],
  decide: async (leaveId: string, approve: boolean, note?: string | null) => sdkGuard(supabase.rpc('hr_leave_decide', { p_leave: leaveId, p_approve: approve, p_note: note ?? null })),
}
