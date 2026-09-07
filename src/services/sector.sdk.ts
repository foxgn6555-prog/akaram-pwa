/**
 * SDK نظام «مسؤول القسم» (00044)
 * كل لمسات Supabase حصراً هنا (قانون SDK). العزل الحقيقي في RLS — هذا العميل
 * يمرر ما يخص المدير فقط، والخادم يرفض أي تجاوز.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type {
  Sector, ManagerProfile, SectorWorker, SectorVehicle,
  SupplyRequest, Breakdown, SectorPhoto, SectorAttendance, SectorSummary,
  CreateWorkerInput, CreateVehicleInput, CreateSupplyInput,
  CreateBreakdownInput, CreateAttendanceInput, Shift,
} from '@features/sector/types'

/* ── القواطع ── */
export const sector = {
  async listSectors(): Promise<Sector[]> {
    const rows = (await sdkGuard(
      supabase.from('sectors').select('id, code, name, sort, parent_sector').order('sort').returns<Record<string, unknown>[]>(),
    )) ?? []
    return rows.map((r) => ({
      id: Number(r.id), code: String(r.code ?? ''), name: String(r.name ?? ''), sort: Number(r.sort ?? 0),
      parent_sector: r.parent_sector === 'zaafaraniya' ? 'zaafaraniya' : 'karrada',
    }))
  },

  async myProfile(): Promise<ManagerProfile | null> {
    const { data, error } = await supabase
      .from('manager_profiles').select('user_id, shift, sectors').maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
      user_id: String(data.user_id),
      shift: (data.shift as Shift) ?? 'morning',
      sectors: Array.isArray(data.sectors) ? (data.sectors as number[]) : [],
    }
  },

  /** حفظ/تحديث ملف المدير (تُستخدم من إنشاء المستخدم عبر الإدارة — RLS تسمح للإدارة) */
  async upsertManagerProfile(userId: string, shift: Shift, sectors: number[]): Promise<void> {
    await sdkVoid(
      supabase.from('manager_profiles').upsert(
        { user_id: userId, shift, sectors } as never,
        { onConflict: 'user_id' },
      ),
    )
  },
}

/* ── الفريق (عمال + آليات) ── */
const WORKER_COLS =
  'id, full_name, phone, sector_id, shift, job_title, created_by, archived_at, archive_reason, created_at'
const VEHICLE_COLS =
  'id, db_number, vehicle_type, sector_id, shift, driver_name, created_by, archived_at, archive_reason, created_at'

function normWorker(r: Record<string, unknown>): SectorWorker {
  return {
    id: String(r.id), full_name: String(r.full_name ?? ''),
    phone: (r.phone as string | null) ?? null,
    sector_id: Number(r.sector_id),
    shift: (r.shift as Shift) ?? 'morning',
    job_title: (r.job_title as string | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}
function normVehicle(r: Record<string, unknown>): SectorVehicle {
  return {
    id: String(r.id), db_number: String(r.db_number ?? ''),
    vehicle_type: (r.vehicle_type as string | null) ?? null,
    sector_id: Number(r.sector_id),
    shift: (r.shift as Shift) ?? 'morning',
    driver_name: (r.driver_name as string | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}

export const sectorTeam = {
  async listWorkers(active = true): Promise<SectorWorker[]> {
    let q = supabase.from('sector_workers').select(WORKER_COLS).order('created_at', { ascending: false })
    q = active ? q.is('archived_at', null) : q.not('archived_at', 'is', null)
    const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
    return rows.map(normWorker)
  },
  async createWorker(input: CreateWorkerInput): Promise<SectorWorker> {
    const res = await supabase.rpc('sector_add_worker', {
      p_full_name: input.full_name,
      p_sector_id: input.sector_id,
      p_shift: input.shift,
      p_phone: input.phone ?? null,
      p_job_title: input.job_title ?? null,
    })
    if (res.error) throw new Error(res.error.message)
    return normWorker(res.data as Record<string, unknown>)
  },
  async updateWorker(id: string, input: Partial<CreateWorkerInput>): Promise<void> {
    await sdkVoid(supabase.from('sector_workers').update(input as never).eq('id', id))
  },
  async archiveWorker(id: string, reason: string): Promise<void> {
    await sdkVoid(supabase.from('sector_workers').update(
      { archived_at: new Date().toISOString(), archive_reason: reason } as never).eq('id', id))
  },

  async listVehicles(active = true): Promise<SectorVehicle[]> {
    let q = supabase.from('sector_vehicles').select(VEHICLE_COLS).order('created_at', { ascending: false })
    q = active ? q.is('archived_at', null) : q.not('archived_at', 'is', null)
    const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
    return rows.map(normVehicle)
  },
  async createVehicle(input: CreateVehicleInput): Promise<SectorVehicle> {
    const res = await supabase.rpc('sector_add_vehicle', {
      p_db_number: input.db_number,
      p_sector_id: input.sector_id,
      p_shift: input.shift,
      p_vehicle_type: input.vehicle_type ?? null,
      p_driver_name: input.driver_name ?? null,
    })
    if (res.error) throw new Error(res.error.message)
    return normVehicle(res.data as Record<string, unknown>)
  },
  async updateVehicle(id: string, input: Partial<CreateVehicleInput>): Promise<void> {
    await sdkVoid(supabase.from('sector_vehicles').update(input as never).eq('id', id))
  },
  async archiveVehicle(id: string, reason: string): Promise<void> {
    await sdkVoid(supabase.from('sector_vehicles').update(
      { archived_at: new Date().toISOString(), archive_reason: reason } as never).eq('id', id))
  },
}

/* ── طلبات المستلزمات ── */
const SUPPLY_COLS =
  'id, manager_id, manager_name, shift, sectors, supply_type, quantity, notes, signed, ref_no,' +
  ' status, submitted_at, archived_at, archive_reason, created_at'
function normSupply(r: Record<string, unknown>): SupplyRequest {
  return {
    id: String(r.id), manager_id: String(r.manager_id ?? ''), manager_name: String(r.manager_name ?? ''),
    shift: (r.shift as Shift) ?? 'morning',
    sectors: Array.isArray(r.sectors) ? (r.sectors as number[]) : [],
    supply_type: String(r.supply_type ?? ''), quantity: Number(r.quantity ?? 0),
    notes: (r.notes as string | null) ?? null,
    signed: Boolean(r.signed), ref_no: (r.ref_no as string | null) ?? null,
    status: (r.status as SupplyRequest['status']) ?? 'draft',
    submitted_at: (r.submitted_at as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}
export const sectorSupplies = {
  async list(scope: 'active' | 'archived' = 'active'): Promise<SupplyRequest[]> {
    let q = supabase.from('sector_supply_requests').select(SUPPLY_COLS).order('created_at', { ascending: false })
    q = scope === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
    const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
    return rows.map(normSupply)
  },
  /** إنشاء + إرسال مباشر (كتاب رسمي للمعاون) — الهوية تُشتق من ملف المدير عبر RPC */
  async create(input: CreateSupplyInput): Promise<SupplyRequest> {
    const res = await supabase.rpc('sector_submit_supply', {
      p_supply_type: input.supply_type,
      p_quantity: input.quantity,
      p_notes: input.notes ?? null,
      p_signed: input.signed,
    })
    if (res.error) throw new Error(res.error.message)
    return normSupply(res.data as Record<string, unknown>)
  },
}

/* ── بلاغات الأعطال ── */
const BREAK_COLS =
  'id, manager_id, manager_name, shift, sectors, db_number, fault_type, notes, status,' +
  ' archived_at, archive_reason, created_at'
function normBreak(r: Record<string, unknown>): Breakdown {
  return {
    id: String(r.id), manager_id: String(r.manager_id ?? ''), manager_name: String(r.manager_name ?? ''),
    shift: (r.shift as Shift) ?? 'morning',
    sectors: Array.isArray(r.sectors) ? (r.sectors as number[]) : [],
    db_number: String(r.db_number ?? ''), fault_type: String(r.fault_type ?? ''),
    notes: (r.notes as string | null) ?? null,
    status: (r.status as Breakdown['status']) ?? 'logged',
    archived_at: (r.archived_at as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}
export const sectorBreakdowns = {
  async list(scope: 'active' | 'archived' = 'active'): Promise<Breakdown[]> {
    let q = supabase.from('sector_breakdowns').select(BREAK_COLS).order('created_at', { ascending: false })
    q = scope === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
    const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
    return rows.map(normBreak)
  },
  async create(input: CreateBreakdownInput): Promise<Breakdown> {
    const res = await supabase.rpc('sector_submit_breakdown', {
      p_db_number: input.db_number,
      p_fault_type: input.fault_type,
      p_notes: input.notes ?? null,
    })
    if (res.error) throw new Error(res.error.message)
    return normBreak(res.data as Record<string, unknown>)
  },
}

/* ── الصور ── */
const PHOTO_COLS =
  'id, manager_id, manager_name, shift, sectors, caption, storage_path,' +
  ' archived_at, archive_reason, created_at'
function normPhoto(r: Record<string, unknown>): SectorPhoto {
  return {
    id: String(r.id), manager_id: String(r.manager_id ?? ''), manager_name: String(r.manager_name ?? ''),
    shift: (r.shift as Shift) ?? 'morning',
    sectors: Array.isArray(r.sectors) ? (r.sectors as number[]) : [],
    caption: (r.caption as string | null) ?? null, storage_path: String(r.storage_path ?? ''),
    archived_at: (r.archived_at as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}
export const sectorPhotos = {
  async list(scope: 'active' | 'archived' = 'active'): Promise<SectorPhoto[]> {
    let q = supabase.from('sector_photos').select(PHOTO_COLS).order('created_at', { ascending: false })
    q = scope === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
    const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
    return rows.map(normPhoto)
  },
  /** رفع صورة إلى Storage ثم تسجيلها عبر RPC (الهوية من ملف المدير) */
  async upload(file: File, caption: string): Promise<SectorPhoto> {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id ?? 'anon'
    const safe = file.name.replace(/[^\w.-]+/g, '_')
    const path = `${uid}/${Date.now()}-${safe}`
    const up = await supabase.storage.from('sector-photos').upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (up.error) throw new Error(up.error.message)
    const res = await supabase.rpc('sector_register_photo', {
      p_storage_path: path,
      p_caption: caption || null,
    })
    if (res.error) throw new Error(res.error.message)
    return normPhoto(res.data as Record<string, unknown>)
  },
  /** رابط مؤقت لعرض الصورة */
  async signedUrl(path: string): Promise<string> {
    const res = await supabase.storage.from('sector-photos').createSignedUrl(path, 60 * 30)
    if (res.error) throw new Error(res.error.message)
    return res.data.signedUrl
  },
}

/* ── الحضورية ── */
const ATT_COLS =
  'id, manager_id, worker_id, worker_name, sector_id, shift, log_date, is_present, note, archived_at, created_at'
function normAtt(r: Record<string, unknown>): SectorAttendance {
  return {
    id: String(r.id), manager_id: String(r.manager_id ?? ''),
    worker_id: String(r.worker_id ?? ''), worker_name: String(r.worker_name ?? ''),
    sector_id: Number(r.sector_id),
    shift: (r.shift as Shift) ?? 'morning',
    log_date: String(r.log_date ?? ''),
    is_present: Boolean(r.is_present),
    note: (r.note as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}
export const sectorAttendance = {
  async listByDate(date: string): Promise<SectorAttendance[]> {
    const rows = (await sdkGuard(
      supabase.from('sector_attendance').select(ATT_COLS).eq('log_date', date)
        .is('archived_at', null).returns<Record<string, unknown>[]>(),
    )) ?? []
    return rows.map(normAtt)
  },
  /** تسجيل/تحديث حضور عامل ليوم معيّن — عبر RPC (يتحقق أن العامل ضمن قواطع المدير) */
  async upsert(input: CreateAttendanceInput): Promise<void> {
    const res = await supabase.rpc('sector_set_attendance', {
      p_worker_id: input.worker_id,
      p_log_date: input.log_date,
      p_is_present: input.is_present,
      p_note: input.note ?? null,
    })
    if (res.error) throw new Error(res.error.message)
  },
}

/* ── ملخص الرئيسية ── */
export async function sectorSummary(): Promise<SectorSummary> {
  const [workers, vehicles, supplies, breaks, photos, todayAtt] = await Promise.all([
    sectorTeam.listWorkers(),
    sectorTeam.listVehicles(),
    sectorSupplies.list('active'),
    sectorBreakdowns.list('active'),
    sectorPhotos.list('active'),
    sectorAttendance.listByDate(new Date().toISOString().slice(0, 10)),
  ])
  return {
    workers: workers.length,
    vehicles: vehicles.length,
    pending_supply: supplies.filter((s) => s.status === 'draft').length,
    submitted_supply: supplies.filter((s) => s.status === 'submitted_to_deputy').length,
    breakdowns: breaks.length,
    photos: photos.length,
    present_today: todayAtt.filter((a) => a.is_present).length,
    absent_today: todayAtt.filter((a) => !a.is_present).length,
  }
}
