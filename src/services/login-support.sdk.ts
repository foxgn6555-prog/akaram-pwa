import { supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'

export type SupportStatus = 'open' | 'waiting' | 'resolved'
export interface SupportMessage { id: string; sender: 'employee' | 'support' | 'system'; body: string; created_at: string }
export interface SupportTicket {
  id: string; reference: string; employee_email?: string; employee_number?: string; employee_name?: string
  status: SupportStatus; created_at?: string; updated_at?: string; last_message_at?: string; resolved_at?: string
}
export interface SupportSettings { support_phone: string | null; business_hours: string | null; is_online: boolean }
export interface LoginLock { normalized_email: string; failure_count: number; window_started_at: string; locked_until: string; updated_at: string }
export interface SupportEmployee { user_id: string; employee_number: string | null; full_name: string | null; email: string | null; registered_phone: string | null }

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'أُرسلت عدة طلبات حديثاً لهذا البريد — انتظر قليلاً قبل المحاولة مجدداً.',
  NOT_FOUND: 'تعذر العثور على الطلب أو التحقق من رابط المحادثة.',
  RESOLVED: 'أُغلق هذا الطلب ولا يمكن إضافة رسائل جديدة.',
  EMPLOYEE_NOT_FOUND: 'لم يُعثر على سجل موظف نشط بهذا البريد.',
  INVALID_PHONE: 'صيغة رقم الاتصال غير صحيحة.',
  FORBIDDEN: 'هذه الوحدة متاحة لمسؤولي تقنية المعلومات فقط.',
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('login-support', { body })
  if (error) {
    let code = (error as { code?: string }).code ?? ''
    const context = (error as { context?: Response }).context
    if (context && typeof context.clone === 'function') {
      try { code = String(((await context.clone().json()) as { error?: string }).error ?? code) } catch { /* generic */ }
    }
    throw new SDKError(MESSAGES[code] ?? 'تعذر إكمال طلب الدعم — حاول مرة أخرى', code || 'LOGIN_SUPPORT_FAILED')
  }
  if (data == null) throw new SDKError('استجابة غير متوقعة من خدمة الدعم', 'LOGIN_SUPPORT_EMPTY')
  return data
}

export const loginSupport = {
  getPublicSettings: () => invoke<{ settings: SupportSettings }>({ action: 'public_settings' }),
  startRequest: (input: { email: string; employee_number: string; employee_name: string; message: string }) =>
    invoke<{ ticket: SupportTicket; token: string }>({ action: 'start_request', ...input }),
  loadThread: (ticketId: string, token: string) =>
    invoke<{ ticket: SupportTicket; messages: SupportMessage[] }>({ action: 'load_thread', ticket_id: ticketId, token }),
  sendMessage: (ticketId: string, token: string, message: string) =>
    invoke<{ ok: boolean }>({ action: 'send_message', ticket_id: ticketId, token, message }),
  listRequests: () => invoke<{ requests: SupportTicket[] }>({ action: 'list_requests' }),
  getRequest: (ticketId: string) => invoke<{ ticket: SupportTicket; messages: SupportMessage[] }>({ action: 'get_request', ticket_id: ticketId }),
  reply: (ticketId: string, message: string) => invoke<{ ok: boolean }>({ action: 'send_reply', ticket_id: ticketId, message }),
  setStatus: (ticketId: string, status: SupportStatus) => invoke<{ ok: boolean }>({ action: 'set_status', ticket_id: ticketId, status }),
  getSettings: () => invoke<{ settings: SupportSettings }>({ action: 'get_settings' }),
  setSettings: (settings: SupportSettings) => invoke<{ settings: SupportSettings }>({ action: 'set_settings', ...settings }),
  listLocks: () => invoke<{ locks: LoginLock[] }>({ action: 'list_locks' }),
  unlockEmail: (email: string) => invoke<{ ok: boolean; affected_sources: number }>({ action: 'unlock_email', email }),
  lookupEmployee: (email: string) => invoke<{ employee: SupportEmployee }>({ action: 'lookup_employee', email }),
}
