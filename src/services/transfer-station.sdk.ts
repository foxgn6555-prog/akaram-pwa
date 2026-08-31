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
}
