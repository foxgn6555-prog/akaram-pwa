/**
 * SDK النظام (البوابة التقنية — وحدة قاعدة البيانات)
 *  · dbStats/dbOverview: مراقبة الجداول والصحة (RPC آمنة)
 *  · consoleReport/consoleFeed/consoleStats/consoleResolve: وحدة Console (رصد الأخطاء الحي)
 *  · errorLogs/resolveError: شاشة أخطاء التطبيق
 */
import { sdkGuard, sdkVoid, supabase } from './client'

export interface DbStat {
  table_name: string
  row_estimate: number
  total_bytes: number
  seq_scan: number
  idx_scan: number
}

export interface DbOverview {
  allowed: boolean
  db_size_bytes?: number
  version?: string
  started_at?: string
  tables_count?: number
  total_rows?: number
  open_errors?: number
}

export interface AppErrorRow {
  id: number
  error_type: 'runtime' | 'network' | 'validation' | 'auth'
  message: string
  stack: string | null
  url: string | null
  user_agent: string | null
  user_id: string | null
  context: Record<string, unknown>
  resolved: boolean
  created_at: string
  /** Console (00166) */
  level: 'error' | 'warn'
  source: string
  portal: string
  kind: string
  fingerprint: string | null
  occurrences: number
  last_seen_at: string
  resolved_at: string | null
  resolution_note: string | null
}

export interface ConsoleFeedFilters {
  level?: 'error' | 'warn' | null
  portal?: string | null
  kind?: string | null
  resolved?: boolean | null
  since?: string | null
  q?: string | null
  limit?: number
}

export interface ConsoleStats {
  open_errors: number
  open_warnings: number
  resolved: number
  affected_users: number
  by_portal: Record<string, number>
  by_kind: Record<string, number>
}

export interface ErrorLogFilters {
  resolved?: boolean
  errorType?: AppErrorRow['error_type']
}

export interface DbTableDetails {
  table: string
  columns: Array<{ name: string; type: string; nullable: boolean }>
  row_estimate: number
  total_bytes: number
}

export const system = {
  async dbTableDetails(table: string): Promise<DbTableDetails> {
    return sdkGuard(supabase.rpc('db_table_details', { p_table: table })) as Promise<DbTableDetails>
  },

  async dbStats(): Promise<DbStat[]> {
    return sdkGuard(supabase.rpc('db_stats')) as Promise<DbStat[]>
  },

  async dbOverview(): Promise<DbOverview> {
    return sdkGuard(supabase.rpc('db_overview')) as Promise<DbOverview>
  },

  async errorLogs(filters: ErrorLogFilters = {}): Promise<AppErrorRow[]> {
    let query = supabase
      .from('app_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filters.resolved !== undefined) query = query.eq('resolved', filters.resolved)
    if (filters.errorType) query = query.eq('error_type', filters.errorType)

    return sdkGuard(query) as Promise<AppErrorRow[]>
  },

  async resolveError(id: number, resolved: boolean): Promise<void> {
    await sdkVoid(supabase.from('app_errors').update({ resolved }).eq('id', id))
  },

  /**
   * Console · إرسال دفعة أحداث (أي مستخدم مصادق). آمن الفشل تماماً: لا يرمي أبداً.
   * التحديد والتجميع يحدثان في الخادم (console_report) وفي الراصد (capture.ts).
   */
  async consoleReport(events: unknown[]): Promise<number> {
    try {
      if (!events.length) return 0
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) return 0
      const { data, error } = await supabase.rpc('console_report', { p_events: events })
      if (error) return 0
      return typeof data === 'number' ? data : 0
    } catch {
      return 0
    }
  },

  async consoleFeed(f: ConsoleFeedFilters = {}): Promise<AppErrorRow[]> {
    return sdkGuard(
      supabase.rpc('console_feed', {
        p_level: f.level ?? null,
        p_portal: f.portal ?? null,
        p_kind: f.kind ?? null,
        p_resolved: f.resolved === undefined ? false : f.resolved,
        p_since: f.since ?? null,
        p_q: f.q ?? null,
        p_limit: f.limit ?? 200,
      }),
    ) as Promise<AppErrorRow[]>
  },

  async consoleStats(since?: string): Promise<ConsoleStats> {
    const args = since ? { p_since: since } : {}
    return sdkGuard(supabase.rpc('console_stats', args)) as Promise<ConsoleStats>
  },

  /** بث حي: أي إدراج/تحديث في app_errors (RLS: IT فقط يستقبل الصفوف) */
  consoleSubscribe(onChange: () => void): () => void {
    const channel = supabase
      .channel('console:app_errors')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_errors' }, onChange)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  },

  async consoleResolve(id: number, resolved: boolean, note?: string | null): Promise<AppErrorRow> {
    return sdkGuard(supabase.rpc('console_resolve', { p_id: id, p_resolved: resolved, p_note: note ?? null })) as Promise<AppErrorRow>
  },
}
