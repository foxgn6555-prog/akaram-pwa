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
