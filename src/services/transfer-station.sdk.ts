/**
 * SDK المحطة التحويلية — سجلات الأوزان (00039)
 *  · list/active · listArchived · create · update
 *  · archive (حذف → أرشيف IT + تنبيه) · restore (من IT)
 *  · sendToOps (إرسال دفتر للتدقيق) · summary (لوحة رئيسية)
 * كل لمسات Supabase حصراً في هذا الملف (قانون SDK).
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type {
  WeightRecord,
  CreateWeightInput,
  UpdateWeightInput,
  WeightSummary,
  Shift,
  SaksatRecord,
  TripRecord,
  AttendanceRecord,
  CreateSaksatInput,
  CreateTripInput,
  CreateAttendanceInput,
} from '@features/transfer-station/types'

const COLS =
  'id, seq, db_number, driver_name, vehicle_type, gross_weight, tare_weight, net_weight, ' +
  'entry_time, log_date, shift, status, submitted_to_ops_at, archived_at, archived_by, ' +
  'archive_reason, created_by, created_at'

function normalize(r: Record<string, unknown>): WeightRecord {
  return {
    id: String(r.id ?? ''),
    seq: (r.seq as number | null) ?? null,
    db_number: String(r.db_number ?? ''),
    driver_name: String(r.driver_name ?? ''),
    vehicle_type: (r.vehicle_type as string | null) ?? null,
    gross_weight: (r.gross_weight as number | null) ?? null,
    tare_weight: (r.tare_weight as number | null) ?? null,
    net_weight: (r.net_weight as number | null) ?? null,
    entry_time: (r.entry_time as string | null) ?? null,
    log_date: String(r.log_date ?? ''),
    shift: (r.shift as Shift) ?? 'morning',
    status: (r.status as WeightRecord['status']) ?? 'draft',
    submitted_to_ops_at: (r.submitted_to_ops_at as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    archived_by: (r.archived_by as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}

/** الصافي = الكلي − الفارغ (يُحسَب في العميل أيضاً للعرض الفوري) */
function withNet(input: CreateWeightInput | UpdateWeightInput) {
  const gross = input.gross_weight
  const tare = input.tare_weight
  const net =
    typeof gross === 'number' && typeof tare === 'number' ? +(gross - tare).toFixed(2) : null
  return { ...input, net_weight: net } as never
}

/* ═══ مساعدات السكسات · النسافات · الحضورية (00043) ═══ */

const STATION_COLS =
  'id, driver_name, vehicle_type, exit_time, log_date, status, submitted_at, ' +
  'archived_at, archive_reason, created_at'

const ATTEND_COLS =
  'id, employee_name, is_present, note, log_date, archived_at, archive_reason, created_at'

function normalizeStation(r: Record<string, unknown>): SaksatRecord {
  return {
    id: String(r.id ?? ''),
    driver_name: String(r.driver_name ?? ''),
    vehicle_type: (r.vehicle_type as string | null) ?? null,
    exit_time: (r.exit_time as string | null) ?? null,
    log_date: String(r.log_date ?? ''),
    status: (r.status as SaksatRecord['status']) ?? 'draft',
    submitted_at: (r.submitted_at as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}

function normalizeAttendance(r: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(r.id ?? ''),
    employee_name: String(r.employee_name ?? ''),
    is_present: Boolean(r.is_present),
    note: (r.note as string | null) ?? null,
    log_date: String(r.log_date ?? ''),
    archived_at: (r.archived_at as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}

/** نطاق الشهر YYYY-MM: من أول الشهر حتى أول الشهر التالي */
function monthRange(month: string): { from: string; to: string } {
  const parts = month.split('-')
  const y = Number(parts[0] ?? 0)
  const m = Number(parts[1] ?? 0)
  const from = `${month}-01`
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from, to }
}

async function listStation(table: string, month?: string): Promise<SaksatRecord[]> {
  const { from, to } = month ? monthRange(month) : { from: '', to: '' }
  const base = supabase
    .from(table)
    .select(STATION_COLS)
    .is('archived_at', null)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
  const q = month ? base.gte('log_date', from).lt('log_date', to) : base
  const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
  return rows.map(normalizeStation)
}

async function listStationSubmitted(table: string): Promise<SaksatRecord[]> {
  const rows =
    (await sdkGuard(
      supabase
        .from(table)
        .select(STATION_COLS)
        .eq('status', 'submitted_to_deputy')
        .is('archived_at', null)
        .order('submitted_at', { ascending: false })
        .returns<Record<string, unknown[]>>(),
    )) ?? []
  return (rows as unknown as Record<string, unknown>[]).map(normalizeStation)
}

async function createStation(table: string, input: CreateSaksatInput): Promise<SaksatRecord> {
  return sdkGuard(
    supabase
      .from(table)
      .insert({
        driver_name: input.driver_name,
        vehicle_type: input.vehicle_type?.trim() || null,
        exit_time: input.exit_time ?? new Date().toISOString(), // وقت الخروج — تلقائي
        log_date: input.log_date,
      } as never)
      .select(STATION_COLS)
      .single()
      .returns<Record<string, unknown>>(),
  ).then((r) => normalizeStation(r as Record<string, unknown>))
}

async function sendFolder(fn: string, month: string): Promise<number> {
  const res = await supabase.rpc(fn, { p_month: month })
  if (res.error) throw new Error(res.error.message)
  return Number(res.data ?? 0)
}

export const transferStation = {
  /** السجلات النشطة (غير المؤرشفة) — مع فلترة اختيارية بالتاريخ/الشفت */
  async list(filter?: { date?: string; shift?: Shift }): Promise<WeightRecord[]> {
    let q = supabase
      .from('ts_weight_records')
      .select(COLS)
      .is('archived_at', null)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (filter?.date) q = q.eq('log_date', filter.date)
    if (filter?.shift) q = q.eq('shift', filter.shift)
    const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
    return rows.map(normalize)
  },

  /** السجلات المؤرشفة (لأرشيف المحطة + يستخدمها أرشيف IT) */
  async listArchived(): Promise<WeightRecord[]> {
    const rows =
      (await sdkGuard(
        supabase
          .from('ts_weight_records')
          .select(COLS)
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false })
          .returns<Record<string, unknown>[]>(),
      )) ?? []
    return rows.map(normalize)
  },

  async create(input: CreateWeightInput): Promise<WeightRecord> {
    return sdkGuard(
      supabase
        .from('ts_weight_records')
        .insert(withNet(input))
        .select(COLS)
        .single()
        .returns<Record<string, unknown>>(),
    ).then((r) => normalize(r as Record<string, unknown>))
  },

  async update(id: string, input: UpdateWeightInput): Promise<void> {
    await sdkVoid(supabase.from('ts_weight_records').update(withNet(input)).eq('id', id))
  },

  /** أرشفة (حذف من المحطة → أرشيف IT مع السبب + تنبيه IT) */
  async archive(id: string, reason: string): Promise<void> {
    await sdkVoid(supabase.rpc('ts_weight_archive', { p_id: id, p_reason: reason }))
  },

  /** استعادة من أرشيف IT → تعود للمحطة */
  async restore(id: string): Promise<void> {
    await sdkVoid(supabase.rpc('ts_weight_restore', { p_id: id }))
  },

  /** إرسال دفتر تاريخ/شفت لغرفة العمليات للتدقيق — يعيد عدد السجلات المُرسلة */
  async sendToOps(date: string, shift: Shift): Promise<number> {
    const res = await supabase.rpc('ts_weight_send_to_ops', {
      p_date: date,
      p_shift: shift,
    })
    if (res.error) throw new Error(res.error.message)
    return Number(res.data ?? 0)
  },

  /** ملخص إحصائي للوحة الرئيسية */
  async summary(): Promise<WeightSummary> {
    const res = await supabase.rpc('ts_weight_summary', { p_days: 7 })
    if (res.error) throw new Error(res.error.message)
    return (res.data ?? {}) as WeightSummary
  },

  /* ═══ السكسات الخارجة · النسافات الخارجة · الحضورية (00043) ═══ */

  /** سجلات السكسات النشطة — مع فلترة اختيارية بالشهر (YYYY-MM) */
  async listSaksat(month?: string): Promise<SaksatRecord[]> {
    return listStation('ts_saksat_records', month)
  },

  /** السكسات المُرسلة لمعاون المدير (الفولدرات الواردة) */
  async listSaksatSubmitted(): Promise<SaksatRecord[]> {
    return listStationSubmitted('ts_saksat_records')
  },

  /** تسجيل خروج سكسة — وقت الخروج تلقائي عند غيابه */
  async createSaksat(input: CreateSaksatInput): Promise<SaksatRecord> {
    return createStation('ts_saksat_records', input)
  },

  /** إرسال فولدر شهر السكسات لمعاون المدير — يعيد عدد السجلات المُرسلة */
  async sendSaksatFolder(month: string): Promise<number> {
    return sendFolder('ts_saksat_send_folder', month)
  },

  async listTrips(month?: string): Promise<TripRecord[]> {
    return listStation('ts_trips_records', month)
  },

  async listTripsSubmitted(): Promise<TripRecord[]> {
    return listStationSubmitted('ts_trips_records')
  },

  async createTrips(input: CreateTripInput): Promise<TripRecord> {
    return createStation('ts_trips_records', input)
  },

  async sendTripsFolder(month: string): Promise<number> {
    return sendFolder('ts_trips_send_folder', month)
  },

  /** سجلات الحضورية — نشطة، مع فلترة اختيارية بالتاريخ */
  async listAttendance(date?: string): Promise<AttendanceRecord[]> {
    const base = supabase
      .from('ts_attendance_records')
      .select(ATTEND_COLS)
      .is('archived_at', null)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
    const q = date ? base.eq('log_date', date) : base
    const rows = (await sdkGuard(q.returns<Record<string, unknown>[]>())) ?? []
    return rows.map(normalizeAttendance)
  },

  async createAttendance(input: CreateAttendanceInput): Promise<AttendanceRecord> {
    return sdkGuard(
      supabase
        .from('ts_attendance_records')
        .insert({
          employee_name: input.employee_name,
          is_present: input.is_present,
          log_date: input.log_date,
        } as never)
        .select(ATTEND_COLS)
        .single()
        .returns<Record<string, unknown>>(),
    ).then((r) => normalizeAttendance(r as Record<string, unknown>))
  },
}
