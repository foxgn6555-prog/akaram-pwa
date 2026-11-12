/**
 * SDK: Audit — سجل التدقيق (قراءة فقط).
 *
 * المصدر: جدول `public.audit_logs` (007 / 00014) — تقرأه سياسة RLS لـ`super_admin` وحده
 * (المدير المفوض = مدير الشركة). `it_admin` لا يراه إطلاقاً — انظر docs/governance-roles.md.
 *
 * لا تلمس supabase خارج هذا الملف (قانون SDK — ADR 002).
 */
import { SDKError } from '@lib/errors/SDKError'
import { supabase } from './client'

export interface AuditLogRow {
  id: number
  table_name: string
  record_id: string | null
  operation: string
  actor_id: string | null
  actor_role: string | null
  changed_fields: unknown
  new_row: unknown
  old_row: unknown
  created_at: string
}

export interface AuditLogFilters {
  tableName?: string | null
  operation?: string | null
  from?: string | null
  to?: string | null
  page?: number
  pageSize?: number
}

export interface AuditLogPage {
  rows: AuditLogRow[]
  total: number
  page: number
  pageSize: number
}

const COLUMNS =
  'id,table_name,record_id,operation,actor_id,actor_role,changed_fields,new_row,old_row,created_at'

/** يُسهّل اختبار التصفية والترقيم دون قاعدة بيانات */
export function buildAuditQuery(filters: AuditLogFilters = {}): { pageSize: number; page: number } {
  const pageSize = Math.min(200, Math.max(1, Math.trunc(filters.pageSize ?? 25)))
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  return { pageSize, page }
}

export const audit = {
  /** سجل التدقيق بترقيم وتصفية — الأحدث أولاً */
  async list(filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    const { pageSize, page } = buildAuditQuery(filters)
    let query = supabase
      .from('audit_logs')
      .select(COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (filters.tableName) query = query.eq('table_name', filters.tableName)
    if (filters.operation) query = query.eq('operation', filters.operation)
    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00Z`)
    if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59Z`)

    const { data, error, count } = (await query) as {
      data: AuditLogRow[] | null
      error: { message: string; code?: string } | null
      count: number | null
    }
    if (error) throw new SDKError(error.message, error.code ?? 'UNKNOWN', error)
    return { rows: data ?? [], total: count ?? 0, page, pageSize }
  },

  /** أكثر الجداول تدقيقاً — لبطاقة الملخص */
  async topTables(limit = 5): Promise<Array<{ table_name: string; count: number }>> {
    const { data, error } = (await supabase.from('audit_logs').select('table_name').limit(5000)) as {
      data: Array<{ table_name: string }> | null
      error: { message: string; code?: string } | null
    }
    if (error) throw new SDKError(error.message, error.code ?? 'UNKNOWN', error)
    const counts = new Map<string, number>()
    for (const row of data ?? []) counts.set(row.table_name, (counts.get(row.table_name) ?? 0) + 1)
    return [...counts.entries()]
      .map(([table_name, count]) => ({ table_name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  },
}
