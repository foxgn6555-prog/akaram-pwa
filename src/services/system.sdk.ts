/**
 * SDK النظام (البوابة التقنية — وحدة قاعدة البيانات)
 *  · dbStats/dbOverview: مراقبة الجداول والصحة (RPC آمنة)
 *  · reportError: تبلّغ الأخطاء من العميل (سجل app_errors)
 *  · errorLogs/resolveError: شاشة أخطاء التطبيق
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { logger } from '@lib/monitoring/logger'

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
   * تبلّغ خطأ من العميل إلى سجل app_errors.
   * آمن الفشل تماماً: يبتلع أخطاءه، يتحقق من الاتصال، ومحدود المعدل.
   */
  async reportError(entry: {
    message: string
    stack?: string | null
    context?: Record<string, unknown>
    errorType?: AppErrorRow['error_type']
  }): Promise<void> {
    try {
      if (!navigator.onLine || !reportLimiter.allow(entry.message)) return

      const { data: sessionData } = await supabase.auth.getSession()

      await supabase.from('app_errors').insert({
        error_type: entry.errorType ?? 'runtime',
        message: entry.message.slice(0, 500),
        stack: entry.stack?.slice(0, 2000) ?? null,
        url: window.location.href,
        user_agent: navigator.userAgent.slice(0, 200),
        user_id: sessionData.session?.user.id ?? null,
        context: entry.context ?? {},
      })
    } catch {
      // صمت متعمد — التبلّغ لا يجب أن يكسر التطبيق أو يولّد حلقة أخطاء
    }
  },
}

/** حد معدل التبلّغ: 20/جلسة + منع تكرار نفس الرسالة خلال 30 ثانية */
const reportLimiter = {
  sent: 0,
  lastByMessage: new Map<string, number>(),
  MAX_PER_SESSION: 20,
  DEDUPE_WINDOW_MS: 30_000,

  allow(message: string): boolean {
    if (this.sent >= this.MAX_PER_SESSION) {
      logger.warn('reportError: تجاوز حد التبلّغ لهذه الجلسة')
      return false
    }
    const last = this.lastByMessage.get(message)
    if (last && Date.now() - last < this.DEDUPE_WINDOW_MS) return false
    this.lastByMessage.set(message, Date.now())
    this.sent += 1
    return true
  },
}
