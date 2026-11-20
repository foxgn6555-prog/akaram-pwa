/**
 * SDK الجلسات والأجهزة (الجولة ٣) — المصدر هو auth.sessions في الخادم.
 *  · list: جلساتي النشطة (IP · المتصفح · وقت الدخول · آخر نشاط · هل هي الحالية)
 *  · end: إنهاء جلسة واحدة — حذف فعلي في الخادم يُبطل رمز التحديث
 *  · endOthers: إنهاء كل الجلسات الأخرى والإبقاء على الحالية
 * لا قرار صلاحية في العميل: كل الدوال محروسة على الخادم وتخصّ صاحب الجلسة وحده.
 */
import { sdkGuard, supabase } from './client'

export interface MySession {
  id: string
  ip: string | null
  user_agent: string | null
  created_at: string
  last_active: string | null
  is_current: boolean
}

/** معرّف الجلسة الحالية من claim session_id داخل رمز الوصول (بلا أي طلب شبكة إضافي) */
export function sessionIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const claims = JSON.parse(atob(padded)) as { session_id?: unknown }
    return typeof claims.session_id === 'string' && claims.session_id ? claims.session_id : null
  } catch {
    return null
  }
}

export const sessions = {
  async list(): Promise<MySession[]> {
    const { data } = await supabase.auth.getSession()
    const current = sessionIdFromToken(data.session?.access_token)
    return sdkGuard(supabase.rpc('my_sessions', { p_current: current })) as Promise<MySession[]>
  },

  async end(sessionId: string): Promise<number> {
    return sdkGuard(supabase.rpc('session_end', { p_session: sessionId })) as Promise<number>
  },

  async endOthers(): Promise<number> {
    return sdkGuard(supabase.rpc('session_end_others')) as Promise<number>
  },
}
