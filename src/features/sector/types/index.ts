/** أنواع نظام «مسؤول القسم» حسب القاطع/الشفت (ميجريشن 00044) */

export type Shift = 'morning' | 'evening' | 'night'

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'الشفت الصباحي',
  evening: 'الشفت المسائي',
  night: 'الشفت الليلي',
}

export type MunicipalitySector = 'karrada' | 'zaafaraniya'

/** منطقة تشغيلية ضمن قاطع الكرادة أو الزعفرانية */
export interface Sector {
  id: number
  code: string
  name: string
  sort: number
  parent_sector: MunicipalitySector
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
  departure_id: string | null
  vehicle_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
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

export interface SectorTripDay {trip_day:string;total_count:number;open_count:number;first_departure_at:string;last_activity_at:string}
export interface SectorVehicleTrip { trip_status?:string|null;id:string;vehicle_id:string;driver_name:string;shift:Shift;sector_id:number;departed_at:string;arrived_at:string|null;site_departed_at:string|null;returned_at:string|null;recipient_manager_id:string|null;recipient_manager_name:string|null;arrival_notes:string|null;site_departure_notes:string|null;vehicle_name:string;db_number:string;image_path:string;area_name:string;parent_sector:'karrada'|'zaafaraniya';support_assignment_id?:string|null;support_role?:'borrowed'|'lent'|null;support_sector_id?:number|null;support_area_name?:string|null;support_counterpart_name?:string|null }

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

/** طلبات الدعم بين مسؤولي الأقسام (00154) */
export type SupportRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed'
export interface SupportAssignment {
  id: string
  departure_id: string
  vehicle_id: string
  vehicle_name: string
  db_number: string
  driver_name: string
  from_sector_id: number
  to_sector_id: number
  started_at: string
  ended_at: string | null
  end_kind: 'released' | 'recalled' | 'returned' | 'cancelled' | null
  end_note: string | null
  trip_status: string | null
}
export interface SupportRequest {
  id: string
  direction?: 'incoming' | 'outgoing'
  status: SupportRequestStatus
  requester_user_id: string
  requester_name: string
  requester_sector_id: number
  requester_area_name: string
  requester_parent_sector?: 'karrada' | 'zaafaraniya'
  target_user_id: string
  target_name: string
  needed_count: number
  reason: string
  decision_note: string | null
  cancel_reason: string | null
  created_at: string
  decided_at: string | null
  completed_at: string | null
  assignments: SupportAssignment[]
}
export interface SupportManagerOption {
  user_id: string
  manager_name: string
  shift: Shift
  sectors: number[]
  area_names: string[]
  parent_sectors: string[]
  active_vehicles: number
}
export interface SupportLendableVehicle {
  departure_id: string
  vehicle_id: string
  vehicle_name: string
  db_number: string
  driver_name: string
  sector_id: number
  area_name: string
  trip_status: string
}
