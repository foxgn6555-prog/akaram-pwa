/** SDK المتعهدين (00158): بوابة المتعهد + تعيين غرفة العمليات + ملخص فريق مسؤول القسم */
import { compressImage } from '@lib/media/image-compress'
import { sdkGuard, sdkVoid, supabase } from './client'

/** 00376: رمز شفت من hr_shifts */
export type Shift = string
/** 00258: المتعهد يكتب «العدد» (يشمل نفسه) بدل قائمة العمال وحاضر/غائب */
export interface ContractorMe {
  user_id: string; full_name: string; manager_user_id: string; manager_name: string; sector_id: number; area_name: string; parent_sector: string; shift: Shift
  today: string; checked_in_today: boolean; checkin_at: string | null; in_zone: boolean | null
  selfie_path: string | null; team_photo_path: string | null
  today_headcount: number | null; month_days: number; month_headcount_total: number; month_locked: boolean; zone_defined: boolean
}
export interface ContractorMonthDay { log_date: string; checked_in: boolean; checkin_at: string | null; in_zone: boolean | null; headcount: number | null }
export interface ContractorManagerOption {
  user_id: string; full_name: string; shift: Shift; sectors: number[]; contractors: number
  areas: { id: number; name: string; parent_sector: string; taken_by: string | null }[]
}
export interface ContractorProfileInfo {
  user_id: string; manager_user_id: string; manager_name: string; sector_id: number; area_name: string; parent_sector: string; shift: Shift; is_active: boolean; assigned_at: string
}
export interface ManagerTeamSummary {
  sector_id: number; area_name: string; parent_sector: string; contractor_user_id: string | null; contractor_name: string | null; contractor_phone: string | null
  today_headcount: number | null; contractor_checked_in: boolean; contractor_checkin_at: string | null; in_zone: boolean | null
  vehicles_now: number
  vehicles: { id: string; db_number: string; vehicle_name: string; driver_name: string; shift: Shift; arrived_at: string; trip_status: string }[]
}
export interface CheckinInput { latitude: number; longitude: number; accuracy: number | null; selfie: File; teamPhoto: File; headcount: number }

const BUCKET = 'contractor-photos'
async function uploadPhoto(raw: File, kind: 'selfie' | 'team'): Promise<string> {
  const file = await compressImage(raw)   // 00319: ضغط موحّد قبل الرفع
  const { data } = await supabase.auth.getUser()
  const uid = data.user?.id ?? 'anon'
  const ext = (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
  const path = `${uid}/${new Date().toISOString().slice(0, 10)}/${kind}-${Date.now()}.${ext}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (up.error) throw new Error(up.error.message)
  return path
}

/** 00263 — أجور المتعهدين (المالية فقط) بالعدد المعتمد من غرفة العمليات: لكل يوم بعدد > 0 ⇒ (العدد − 1) × أجر العامل + أجر المتعهد */
export type ApprovedSource = 'contractor' | 'follow_up' | 'sector_manager'
export interface ContractorWageMonthStatus { month: string; approved: boolean; approved_source: ApprovedSource | null; approved_by_name: string | null; approved_at: string | null; is_locked: boolean; month_ended: boolean }
export interface ContractorWageRow {
  contractor_user_id: string; contractor_name: string; contractor_phone: string | null; sector_id: number; area_name: string; parent_sector: string; shift: Shift; is_active: boolean
  approved: boolean; approved_source: ApprovedSource | null
  paid_days: number; worker_days: number; headcount_total: number
  /** 00303: أيام فيها رقم من جهة أخرى ولا رقم من الجهة المعتمدة — غير مدفوعة */
  uncovered_days?: number | null
  contractor_daily_wage: number; worker_daily_wage: number; rates_set: boolean
  contractor_pay: number | null; workers_pay: number | null; total_pay: number | null
  note: string | null; set_by_name: string | null; set_at: string | null
}
export interface ContractorWageDay { log_date: string; headcount: number | null; workers: number | null; contractor_pay: number | null; workers_pay: number | null; day_pay: number | null; edit_reason: string | null }
export const contractors = {
  // ── المالية: أجور المتعهدين (00263) ──
  async wagesMonthStatus(month: string): Promise<ContractorWageMonthStatus | null> {
    const rows = (await sdkGuard(supabase.rpc('finance_contractor_month_status', { p_month: `${month.slice(0, 7)}-01` }))) as ContractorWageMonthStatus[] | null
    return rows?.[0] ?? null
  },
  async wagesSheet(month: string): Promise<ContractorWageRow[]> {
    return ((await sdkGuard(supabase.rpc('finance_contractor_wages_sheet', { p_month: `${month.slice(0, 7)}-01` }))) as ContractorWageRow[] | null) ?? []
  },
  async wageDays(contractorId: string, month: string): Promise<ContractorWageDay[]> {
    return ((await sdkGuard(supabase.rpc('finance_contractor_wage_days', { p_contractor: contractorId, p_month: `${month.slice(0, 7)}-01` }))) as ContractorWageDay[] | null) ?? []
  },
  async setRates(x: { contractorId: string; month: string; contractorDaily: number; workerDaily: number; note?: string | null }): Promise<unknown> {
    return sdkGuard(supabase.rpc('finance_contractor_rates_set', { p_contractor: x.contractorId, p_month: `${x.month.slice(0, 7)}-01`, p_contractor_daily: x.contractorDaily, p_worker_daily: x.workerDaily, p_note: x.note ?? null }))
  },
  async copyPreviousRates(month: string): Promise<number> {
    return ((await sdkGuard(supabase.rpc('finance_contractor_rates_copy_previous', { p_month: `${month.slice(0, 7)}-01` }))) as number | null) ?? 0
  },
  // ── بوابة المتعهد ──
  async me(): Promise<ContractorMe | null> {
    const rows = (await sdkGuard(supabase.rpc('contractor_me'))) as ContractorMe[] | null
    return rows?.[0] ?? null
  },
  async myMonth(month?: string): Promise<ContractorMonthDay[]> {
    return ((await sdkGuard(supabase.rpc('contractor_my_month', { p_month: month ?? null }))) as ContractorMonthDay[] | null) ?? []
  },
  async setHeadcount(headcount: number): Promise<void> {
    await sdkGuard(supabase.rpc('contractor_set_headcount', { p_headcount: headcount }))
  },
  async checkin(input: CheckinInput): Promise<void> {
    const [selfiePath, teamPath] = await Promise.all([uploadPhoto(input.selfie, 'selfie'), uploadPhoto(input.teamPhoto, 'team')])
    await sdkGuard(
      supabase.rpc('contractor_checkin', {
        p_lat: input.latitude, p_lng: input.longitude, p_accuracy: input.accuracy, p_selfie_path: selfiePath, p_team_photo_path: teamPath, p_headcount: input.headcount,
      }),
    )
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
    await sdkVoid(supabase.rpc('contractor_unassign', { p_user_id: userId, p_reason: reason.trim() }))
  },
  // ── مسؤول القسم ──
  /** 00257: تذاكر صور متعهديّ اليوم (لمسؤول القسم) */
  async managerContractorPhotosToday(): Promise<{ contractor_user_id: string; tickets_today: number; photos_today: number }[]> {
    const { data, error } = await supabase.rpc('manager_contractor_photos_today')
    if (error) throw error
    return (data ?? []) as { contractor_user_id: string; tickets_today: number; photos_today: number }[]
  },
  async managerTeamSummary(): Promise<ManagerTeamSummary[]> {
    return ((await sdkGuard(supabase.rpc('manager_team_summary'))) as ManagerTeamSummary[] | null) ?? []
  },
}
