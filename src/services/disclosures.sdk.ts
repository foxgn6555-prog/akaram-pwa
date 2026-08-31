/**
 * SDK وحدة الكشوفات (00040)
 *  · list / listArchived / create / update
 *  · archive (حذف → أرشيف IT) · restore (من IT)
 *  · submit (رفع لمعاون المدير المفوض) · summary
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type {
  Disclosure,
  CreateDisclosureInput,
  DisclosureSummary,
} from '@features/disclosures/types'

const COLS =
  'id, ref_no, db_number, driver_name, vehicle_type, contractor_name, sector, shift, ' +
  'log_date, violation_type, penalty_type, details, status, submitted_at, prepared_by_name, ' +
  'archived_at, archived_by, archive_reason, created_by, created_at'

function normalize(r: Record<string, unknown>): Disclosure {
  return {
    id: String(r.id ?? ''),
    ref_no: (r.ref_no as string | null) ?? null,
    db_number: String(r.db_number ?? ''),
    driver_name: String(r.driver_name ?? ''),
    vehicle_type: (r.vehicle_type as string | null) ?? null,
    contractor_name: (r.contractor_name as string | null) ?? null,
    sector: (r.sector as string | null) ?? null,
    shift: (r.shift as Disclosure['shift']) ?? 'morning',
    log_date: String(r.log_date ?? ''),
    violation_type: (r.violation_type as Disclosure['violation_type']) ?? 'delay',
    penalty_type: (r.penalty_type as Disclosure['penalty_type']) ?? null,
    details: String(r.details ?? ''),
    status: (r.status as Disclosure['status']) ?? 'draft',
    submitted_at: (r.submitted_at as string | null) ?? null,
    prepared_by_name: (r.prepared_by_name as string | null) ?? null,
    archived_at: (r.archived_at as string | null) ?? null,
    archived_by: (r.archived_by as string | null) ?? null,
    archive_reason: (r.archive_reason as string | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }
}

export const disclosures = {
  async list(): Promise<Disclosure[]> {
    const rows =
      (await sdkGuard(
        supabase
          .from('disclosures')
          .select(COLS)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .returns<Record<string, unknown>[]>(),
      )) ?? []
    return rows.map(normalize)
  },

  async listArchived(): Promise<Disclosure[]> {
    const rows =
      (await sdkGuard(
        supabase
          .from('disclosures')
          .select(COLS)
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false })
          .returns<Record<string, unknown>[]>(),
      )) ?? []
    return rows.map(normalize)
  },

  async create(input: CreateDisclosureInput): Promise<Disclosure> {
    return sdkGuard(
      supabase.from('disclosures').insert(input as never).select(COLS).single()
        .returns<Record<string, unknown>>(),
    ).then((r) => normalize(r as Record<string, unknown>))
  },

  async update(id: string, input: Partial<CreateDisclosureInput>): Promise<void> {
    await sdkVoid(supabase.from('disclosures').update(input as never).eq('id', id))
  },

  async archive(id: string, reason: string): Promise<void> {
    await sdkVoid(supabase.rpc('disclosure_archive', { p_id: id, p_reason: reason }))
  },

  async restore(id: string): Promise<void> {
    await sdkVoid(supabase.rpc('disclosure_restore', { p_id: id }))
  },

  async submit(id: string): Promise<void> {
    await sdkVoid(supabase.rpc('disclosure_submit', { p_id: id }))
  },

  async summary(): Promise<DisclosureSummary> {
    const res = await supabase.rpc('disclosure_summary')
    if (res.error) throw new Error(res.error.message)
    return (res.data ?? {}) as DisclosureSummary
  },
}
