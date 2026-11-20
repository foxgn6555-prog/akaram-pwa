/**
 * SDK المراقبة الأمنية (الجولة ٤) — قراءة فقط + ضبط سياسة الجلسات.
 * كل الدوال محروسة في الخادم بدور it_admin: الواجهة لا تقرر شيئاً.
 */
import { sdkGuard, supabase } from './client'

export type SecurityEventKind =
  | 'login_success'
  | 'login_failed'
  | 'device_conflict'
  | 'limit_exceeded'
  | 'session_revoked'
  | 'switch_approved'
  | 'switch_denied'
  | 'policy_changed'

export type SecurityOutcome = 'info' | 'allowed' | 'blocked'

export interface SecurityEvent {
  id: number
  user_id: string | null
  email: string | null
  event: SecurityEventKind
  outcome: SecurityOutcome
  session_id: string | null
  ip: string | null
  user_agent: string | null
  country: string | null
  city: string | null
  detail: Record<string, unknown>
  created_at: string
}

export interface SessionPolicyRow {
  user_id: string
  email: string | null
  max_sessions: number
  enforce: boolean
  note: string | null
  active_sessions: number
  updated_at: string | null
}

/** الجولة ٧ — السجل الموحّد */
export type TimelineSource = 'session' | 'permissions' | 'roles'
export type TimelineOutcome = 'info' | 'allowed' | 'blocked' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface TimelineRow {
  occurred_at: string
  source: TimelineSource
  kind: string
  outcome: TimelineOutcome
  actor_id: string | null
  actor_label: string | null
  target_id: string | null
  target_label: string | null
  summary: string
  detail: Record<string, unknown>
}

export interface SecurityOverview {
  days: number
  session: { total: number; blocked: number; logins: number; failed: number }
  permissions: { total: number; level_sets: number }
  roles: { total: number; pending: number; approved: number; rejected: number }
  accounts: { with_policy: number; with_levels: number }
  last_event_at: string | null
}

export const security = {
  async events(params: { user?: string | null; event?: SecurityEventKind | null; limit?: number } = {}): Promise<SecurityEvent[]> {
    return sdkGuard(
      supabase.rpc('security_events_list', {
        p_user: params.user ?? null,
        p_event: params.event ?? null,
        p_limit: params.limit ?? 200,
      }),
    ) as Promise<SecurityEvent[]>
  },

  /** الجولة ٧ — سجل موحّد: جلسات + صلاحيات + أدوار، بتصفية حساب/مدة/مصدر */
  async timeline(params: { user?: string | null; days?: number; source?: TimelineSource | null; limit?: number } = {}): Promise<TimelineRow[]> {
    return sdkGuard(
      supabase.rpc('it_security_timeline', {
        p_user: params.user ?? null,
        p_days: params.days ?? 7,
        p_source: params.source ?? null,
        p_limit: params.limit ?? 300,
      }),
    ) as Promise<TimelineRow[]>
  },

  /** الجولة ٧ — بطاقات العدّ */
  async overview(days = 7): Promise<SecurityOverview> {
    return sdkGuard(supabase.rpc('it_security_overview', { p_days: days })) as Promise<SecurityOverview>
  },

  async policyList(search?: string | null, limit = 200): Promise<SessionPolicyRow[]> {
    return sdkGuard(
      supabase.rpc('session_policy_list', { p_search: search ?? null, p_limit: limit }),
    ) as Promise<SessionPolicyRow[]>
  },

  async setPolicy(userId: string, maxSessions: number, enforce: boolean, note?: string | null): Promise<unknown> {
    return sdkGuard(
      supabase.rpc('session_policy_set', {
        p_user: userId,
        p_max_sessions: maxSessions,
        p_enforce: enforce,
        p_note: note ?? null,
      }),
    )
  },
}
