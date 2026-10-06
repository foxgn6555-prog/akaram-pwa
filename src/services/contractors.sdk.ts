/** SDK المتعهدين (00158): بوابة المتعهد + تعيين غرفة العمليات + ملخص فريق مسؤول القسم */
import { sdkGuard, supabase } from './client'

export type Shift = 'morning' | 'evening' | 'night'
export type AttendanceStatus = 'present' | 'absent'
export interface ContractorMe {
  user_id: string; full_name: string; manager_user_id: string; manager_name: string; sector_id: number; area_name: string; parent_sector: string; shift: Shift
  workers_count: number; today: string; checked_in_today: boolean; checkin_at: string | null; in_zone: boolean | null
  selfie_path: string | null; team_photo_path: string | null
  today_present: number; today_absent: number; today_unmarked: number; month_present: number; month_absent: number; zone_defined: boolean
}
export interface ContractorWorker {
  id: string; full_name: string; phone: string | null; sector_id: number; area_name: string; parent_sector: string; created_at: string
  status: AttendanceStatus | null; marked_at: string | null; month_present: number; month_absent: number
}
export interface ContractorMonthRow { worker_id: string; full_name: string; days: Record<string, AttendanceStatus>; present_days: number; absent_days: number }
export interface ContractorManagerOption {
  user_id: string; full_name: string; shift: Shift; sectors: number[]; contractors: number
  areas: { id: number; name: string; parent_sector: string; taken_by: string | null }[]
}
export interface ContractorProfileInfo {
  user_id: string; manager_user_id: string; manager_name: string; sector_id: number; area_name: string; parent_sector: string; shift: Shift; is_active: boolean; workers_count: number; assigned_at: string
}
export interface ManagerTeamSummary {
  sector_id: number; area_name: string; parent_sector: string; contractor_user_id: string | null; contractor_name: string | null; contractor_phone: string | null
  workers_count: number; today_present: number; today_absent: number; contractor_checked_in: boolean; contractor_checkin_at: string | null; in_zone: boolean | null
  vehicles_now: number
  vehicles: { id: string; db_number: string; vehicle_name: string; driver_name: string; shift: Shift; arrived_at: string; trip_status: string }[]
}
export interface CheckinInput { latitude: number; longitude: number; accuracy: number | null; selfie: File; teamPhoto: File }

const BUCKET = 'contractor-photos'
async function uploadPhoto(file: File, kind: 'selfie' | 'team'): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const uid = data.user?.id ?? 'anon'
  const ext = (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
  const path = `${uid}/${new Date().toISOString().slice(0, 10)}/${kind}-${Date.now()}.${ext}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (up.error) throw new Error(up.error.message)
  return path
}

/** 00188 — كشف أجور عمال المتعهدين (المالية فقط) */
export type ContractorWageMode = 'monthly' | 'daily'
export interface ContractorWageRow {
  contractor_user_id: string; contractor_name: string; sector_id: number; area_name: string; parent_sector: string
  worker_id: string; full_name: string; phone: string | null; is_active: boolean
  present_days: number; absent_days: number; marked_days: number; contractor_checkins: number
  wage_mode: ContractorWageMode; monthly_wage: number; daily_wage: number; payable: number | null; note: string | null; set_by_name: string | null; set_at: string | null
}
export const contractors = {
  // ── المالية: أجور عمال المتعهدين ──
  async wagesSheet(month: string): Promise<ContractorWageRow[]> {
    return ((await sdkGuard(supabase.rpc('finance_contractor_wages_sheet', { p_month: `${month.slice(0, 7)}-01` }))) as ContractorWageRow[] | null) ?? []
  },
  async setWage(x: { workerId: string; month: string; mode: ContractorWageMode; amount: number; note?: string | null }): Promise<unknown> {
    return sdkGuard(supabase.rpc('finance_contractor_wage_set', { p_worker: x.workerId, p_month: `${x.month.slice(0, 7)}-01`, p_mode: x.mode, p_amount: x.amount, p_note: x.note ?? null }))
  },
  async copyPreviousWages(month: string): Promise<number> {
    return ((await sdkGuard(supabase.rpc('finance_contractor_wages_copy_previous', { p_month: `${month.slice(0, 7)}-01` }))) as number | null) ?? 0
  },
  // ── بوابة المتعهد ──
  async me(): Promise<ContractorMe | null> {
    const rows = (await sdkGuard(supabase.rpc('contractor_me'))) as ContractorMe[] | null
    return rows?.[0] ?? null
  },
  async myWorkers(date?: string): Promise<ContractorWorker[]> {
    return ((await sdkGuard(supabase.rpc('contractor_my_workers', { p_date: date ?? null }))) as ContractorWorker[] | null) ?? []
  },
  async addWorker(fullName: string, phone?: string | null): Promise<void> {
    await sdkGuard(supabase.rpc('contractor_add_worker', { p_full_name: fullName.trim(), p_phone: phone?.trim() || null }))
  },
  async removeWorker(workerId: string, reason?: string): Promise<void> {
    await sdkGuard(supabase.rpc('contractor_remove_worker', { p_worker_id: workerId, p_reason: reason?.trim() || null }))
  },
  async checkin(input: CheckinInput): Promise<void> {
    const [selfiePath, teamPath] = await Promise.all([uploadPhoto(input.selfie, 'selfie'), uploadPhoto(input.teamPhoto, 'team')])
    await sdkGuard(
      supabase.rpc('contractor_checkin', {
        p_lat: input.latitude, p_lng: input.longitude, p_accuracy: input.accuracy, p_selfie_path: selfiePath, p_team_photo_path: teamPath,
      }),
    )
  },
  async markAttendance(workerId: string, status: AttendanceStatus, date?: string): Promise<void> {
    await sdkGuard(supabase.rpc('contractor_mark_attendance', { p_worker_id: workerId, p_status: status, p_date: date ?? null }))
  },
  async markAll(status: AttendanceStatus, date?: string): Promise<number> {
    return ((await sdkGuard(supabase.rpc('contractor_mark_all', { p_status: status, p_date: date ?? null }))) as number | null) ?? 0
  },
  async monthGrid(month?: string): Promise<ContractorMonthRow[]> {
    return ((await sdkGuard(supabase.rpc('contractor_month_grid', { p_month: month ?? null }))) as ContractorMonthRow[] | null) ?? []
  },
  async signedUrl(path: string): Promise<string> {
    const res = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30)
    if (res.error) throw new Error(res.error.message)
    return res.data.signedUrl
  },
  // ── التطوير المركزية: إسناد حساب المتعهد إلى مسؤول قسم ──
  async managerOptions(): Promise<ContractorManagerOption[]> {
    return ((await sdkGuard(supabase.rpc('contractor_manager_options'))) as ContractorManagerOption[] | null) ?? []
  },
  async profileForUser(userId: string): Promise<ContractorProfileInfo | null> {
    const rows = (await sdkGuard(supabase.rpc('contractor_profile_for_user', { p_user_id: userId }))) as ContractorProfileInfo[] | null
    return rows?.[0] ?? null
  },
  async assign(userId: string, managerUserId: string, sectorId?: number | null, notes?: string): Promise<void> {
    await sdkGuard(supabase.rpc('contractor_assign', { p_user_id: userId, p_manager_user_id: managerUserId, p_sector_id: sectorId ?? null, p_notes: notes?.trim() || null }))
  },
  async unassign(userId: string, reason: string): Promise<void> {
    await sdkGuard(supabase.rpc('contractor_unassign', { p_user_id: userId, p_reason: reason.trim() }))
  },
  // ── مسؤول القسم ──
  async managerTeamSummary(): Promise<ManagerTeamSummary[]> {
    return ((await sdkGuard(supabase.rpc('manager_team_summary'))) as ManagerTeamSummary[] | null) ?? []
  },
}
