/** أنواع نظام «مسؤول القسم» حسب القاطع/الشفت (ميجريشن 00044) */

export type Shift = 'morning' | 'evening' | 'night'

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'الشفت الصباحي',
  evening: 'الشفت المسائي',
  night: 'الشفت الليلي',
}

/** قاطع من القواطع الثمانية */
export interface Sector {
  id: number
  code: string
  name: string
  sort: number
}

/** ملف إسناد المدير للشفت والقواطع */
export interface ManagerProfile {
  user_id: string
  shift: Shift
  sectors: number[]
}

/** عامل ضمن قاطع (فريق المدير) */
export interface SectorWorker {
  id: string
  full_name: string
  phone: string | null
  sector_id: number
  shift: Shift
  job_title: string | null
  created_by: string | null
  archived_at: string | null
  archive_reason: string | null
  created_at: string | null
}

/** آلية ضمن قاطع (DB) */
export interface SectorVehicle {
  id: string
  db_number: string
  vehicle_type: string | null
  sector_id: number
  shift: Shift
  driver_name: string | null
  created_by: string | null
  archived_at: string | null
  archive_reason: string | null
  created_at: string | null
}

/** طلب مستلزمات قاطع (كتاب رسمي) */
export interface SupplyRequest {
  id: string
  manager_id: string
  manager_name: string
  shift: Shift
  sectors: number[]
  supply_type: string
  quantity: number
  notes: string | null
  signed: boolean
  ref_no: string | null
  status: 'draft' | 'submitted_to_deputy' | 'archived'
  submitted_at: string | null
  archived_at: string | null
  archive_reason: string | null
  created_at: string | null
}

/** بلاغ عطل آلية */
export interface Breakdown {
  id: string
  manager_id: string
  manager_name: string
  shift: Shift
  sectors: number[]
  db_number: string
  fault_type: string
  notes: string | null
  status: 'logged' | 'resolved' | 'archived'
  archived_at: string | null
  archive_reason: string | null
  created_at: string | null
}

/** صورة مرفوعة */
export interface SectorPhoto {
  id: string
  manager_id: string
  manager_name: string
  shift: Shift
  sectors: number[]
  caption: string | null
  storage_path: string
  archived_at: string | null
  archive_reason: string | null
  created_at: string | null
}

/** سجل حضور عامل */
export interface SectorAttendance {
  id: string
  manager_id: string
  worker_id: string
  worker_name: string
  sector_id: number
  shift: Shift
  log_date: string
  is_present: boolean
  note: string | null
  archived_at: string | null
  created_at: string | null
}

/** ملخص الرئيسية */
export interface SectorSummary {
  workers: number
  vehicles: number
  pending_supply: number
  submitted_supply: number
  breakdowns: number
  photos: number
  present_today: number
  absent_today: number
}

/** إدخالات الإنشاء */
export interface CreateWorkerInput {
  full_name: string
  phone?: string | null
  sector_id: number
  shift: Shift
  job_title?: string | null
}
export type UpdateWorkerInput = Partial<CreateWorkerInput>

export interface CreateVehicleInput {
  db_number: string
  vehicle_type?: string | null
  sector_id: number
  shift: Shift
  driver_name?: string | null
}
export type UpdateVehicleInput = Partial<CreateVehicleInput>

export interface CreateSupplyInput {
  supply_type: string
  quantity: number
  notes?: string | null
  signed: boolean
}

export interface CreateBreakdownInput {
  db_number: string
  fault_type: string
  notes?: string | null
}

export interface CreateAttendanceInput {
  worker_id: string
  worker_name: string
  sector_id: number
  shift: Shift
  log_date: string
  is_present: boolean
  note?: string | null
}
