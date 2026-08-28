/** SDK الأرشيف (00029) — عرض المؤرشف · استعادة · عدادات */
import { sdkGuard, sdkVoid, supabase } from './client'

export interface ArchivedRecord {
  id: string
  name: string
  table: string
  archived_at: string
  archive_reason: string | null
  code?: string | null
  employee_number?: string | null
}

export const archive = {
  async counts(): Promise<Array<{ table: string; count: number }>> {
    return sdkGuard(supabase.rpc('archive_counts')) as Promise<Array<{ table: string; count: number }>>
  },

  /** مؤرشفو جدول معين */
  async listTable(table: string): Promise<ArchivedRecord[]> {
    const selectMap: Record<string, string> = {
      employees: 'id, full_name, employee_number, archived_at, archive_reason',
      departments: 'id, name, archived_at, archive_reason',
      branches: 'id, name, code, archived_at, archive_reason',
      biometric_devices: 'id, name, serial_number, archived_at, archive_reason',
      vehicles: 'id, name, plate, archived_at, archive_reason',
      dynamic_portals: 'id, name, slug, archived_at, archive_reason',
    }
    const select = selectMap[table] ?? 'id, name, archived_at, archive_reason'
    let query = supabase.from(table).select(select).not('archived_at', 'is', null)
    query = query.order('archived_at', { ascending: false })

    return sdkGuard(
      query.returns<Record<string, unknown>[]>(),
    ).then((rows) =>
      ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? r.full_name ?? ''),
        table,
        archived_at: String(r.archived_at ?? ''),
        archive_reason: (r.archive_reason as string | null) ?? null,
        code: (r.code as string | null) ?? null,
        employee_number: (r.employee_number as string | null) ?? null,
      })),
    )
  },

  /** استعادة سجل (IT حصراً) */
  async restore(table: string, id: string): Promise<void> {
    await sdkVoid(supabase.rpc('archive_restore', { p_table: table, p_id: id }))
  },

  /** أرشفة سجل (IT/HR) */
  async archive(table: string, id: string, reason: string): Promise<void> {
    await sdkVoid(supabase.rpc('archive_record', { p_table: table, p_id: id, p_reason: reason }))
  },
}
