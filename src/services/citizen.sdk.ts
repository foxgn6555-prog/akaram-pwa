/**
 * SDK استقبال شكاوى المواطنين والدعم الفني المباشر (00168).
 *   · المواطن (بلا حساب): دخول بالاسم والهاتف → token يُحفظ محلياً؛ كل الدوال تأخذ token.
 *   · غرفة العمليات: قائمة الشكاوى، الإسناد لمسؤول قسم، الحالات، طابور الدعم، الإعدادات.
 *   · مسؤول القسم: المسندة إليه. · التقارير: معاون المدير المفوض / المدير المفوض / غرفة العمليات.
 */
import { sdkGuard, sdkMaybe, sdkVoid, supabase } from './client'

export type CitizenStatus = 'new' | 'in_progress' | 'on_hold' | 'resolved'
export const CITIZEN_STATUS_LABEL: Record<CitizenStatus, string> = { new: 'جديدة', in_progress: 'قيد المعالجة', on_hold: 'معلقة', resolved: 'تمت المعالجة' }
export const CITIZEN_STATUS_ORDER: CitizenStatus[] = ['new', 'in_progress', 'on_hold', 'resolved']

export interface CitizenSession { token: string; full_name: string; phone: string }
export interface CitizenPortalInfo { org_name: string; about: string; phones: Array<{ label: string; number: string }>; hours: string; address: string | null; support_online: boolean }
export interface CitizenEvent { kind: 'created' | 'assigned' | 'status' | 'note' | 'rated'; from: string | null; to: string | null; to_label: string | null; note: string | null; actor: string | null; at: string }
export interface CitizenComplaint {
  id: string; ref_no: string; full_name: string; phone: string | null; details: string; lat: number | null; lng: number | null; address_text: string | null
  status: CitizenStatus; status_label: string; assigned_to: string | null; assignee_name: string | null; assigned_at: string | null
  hold_reason: string | null; resolution_note: string | null; resolved_at: string | null; citizen_rating: number | null; created_at: string; updated_at: string
  photos: Array<{ id: string; path: string }>; events: CitizenEvent[]
}
export interface CitizenChatMessage { id: number; sender: 'citizen' | 'agent' | 'system'; body: string; at: string }
export interface CitizenChat {
  id: string; status: 'waiting' | 'active' | 'closed'; agent_name: string | null; requested_at: string; accepted_at: string | null; closed_at: string | null
  closed_by: 'citizen' | 'agent' | 'system' | null; rating: number | null; queue_position: number | null; messages: CitizenChatMessage[]; citizen_name?: string; phone?: string
}
export interface CitizenQueueItem {
  id: string; status: 'waiting' | 'active' | 'closed'; citizen_name: string; phone: string; requested_at: string; accepted_at: string | null
  agent_id: string | null; agent_name: string | null; mine: boolean; last_message: string | null; last_at: string | null; unread: number
}
export interface CitizenManager { user_id: string; full_name: string; department_name: string | null }
export interface CitizenReport {
  period: { from: string; to: string; days: number }
  complaints: {
    total: number; new: number; in_progress: number; on_hold: number; resolved: number; unassigned_over_24h: number
    avg_resolution_hours: number | null; avg_assign_hours: number | null; avg_rating: number | null; rated: number; with_location: number; with_photos: number
    by_assignee: Array<{ name: string; total: number; resolved: number; on_hold: number }>
    series: Array<{ d: string; count: number; resolved: number }>
    oldest_open: Array<{ ref_no: string; name: string; status: CitizenStatus; status_label: string; age_hours: number; assignee: string | null }>
  }
  support: {
    sessions: number; answered: number; abandoned: number; waiting_now: number; avg_wait_minutes: number | null; avg_first_reply_minutes: number | null
    avg_rating: number | null; rated: number; messages: number; by_agent: Array<{ name: string; sessions: number; avg_rating: number | null }>
  }
  generated_at: string
}

const ERRORS: Record<string, string> = {
  CITIZEN_PHONE_INVALID: 'رقم الهاتف غير صحيح — اكتبه بصيغة 07XXXXXXXXX',
  CITIZEN_NAME_INVALID: 'اكتب اسمك الكامل (3 أحرف على الأقل)',
  CITIZEN_NAME_TRIPLE_REQUIRED: 'اكتب اسمك الثلاثي (الاسم واسم الأب واسم الجد)',
  CITIZEN_DETAILS_SHORT: 'اكتب تفاصيل الشكوى بوضوح (10 أحرف على الأقل)',
  CITIZEN_DETAILS_LONG: 'تفاصيل الشكوى طويلة جداً',
  CITIZEN_DAILY_LIMIT: 'وصلت الحد الأقصى للشكاوى اليوم (5) — يمكنك المتابعة غداً أو التحدث مع الدعم',
  CITIZEN_PHOTOS_LIMIT: 'الحد الأقصى 5 صور',
  CITIZEN_LOCATION_INVALID: 'الموقع غير صالح',
  CITIZEN_PHOTO_PATH_INVALID: 'تعذر ربط الصور بالشكوى — أعد المحاولة',
  CITIZEN_SESSION_INVALID: 'انتهت جلستك — أدخل اسمك ورقم هاتفك مجدداً',
  CITIZEN_RATING_INVALID: 'التقييم من 1 إلى 5 نجوم',
  CITIZEN_COMPLAINT_NOT_RATABLE: 'يمكن تقييم الشكوى بعد معالجتها فقط',
  CITIZEN_MESSAGE_INVALID: 'اكتب رسالة (حتى 2000 حرف)',
  CITIZEN_CHAT_CLOSED: 'المحادثة مغلقة — اطلب محادثة جديدة',
  CITIZEN_RATE_LIMIT: 'رسائل كثيرة خلال وقت قصير — انتظر قليلاً',
  CITIZEN_CHAT_NOT_RATABLE: 'يمكن تقييم المحادثة بعد انتهائها',
  CITIZEN_CHAT_TAKEN: 'هذه المحادثة يتولاها زميل آخر',
  CITIZEN_CHAT_NOT_FOUND: 'المحادثة غير موجودة',
  CITIZEN_FORBIDDEN: 'ليست لديك صلاحية على هذه العملية',
  CITIZEN_ASSIGNEE_NOT_MANAGER: 'الإسناد يكون لمسؤول قسم فقط',
  CITIZEN_COMPLAINT_NOT_FOUND: 'الشكوى غير موجودة',
  CITIZEN_COMPLAINT_RESOLVED: 'الشكوى منجزة — أعدها إلى «جديدة» أولاً إن أردت إعادة إسنادها',
  CITIZEN_STATUS_INVALID: 'حالة غير صالحة',
  CITIZEN_ASSIGNEE_REQUIRED: 'لا تصبح الشكوى «قيد المعالجة» قبل إسنادها لمسؤول قسم',
  CITIZEN_NOTE_REQUIRED: 'اكتب السبب/الملاحظة',
  CITIZEN_PHONES_INVALID: 'أرقام التواصل غير صالحة',
  CITIZEN_RANGE_INVALID: 'الفترة غير صالحة (حتى سنة)',
}
export function citizenErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  for (const [k, v] of Object.entries(ERRORS)) if (msg.includes(k)) return v
  return msg || 'حدث خطأ غير متوقع'
}

const rpc = <T,>(fn: string, args: Record<string, unknown>) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>
const rpcMaybe = <T,>(fn: string, args: Record<string, unknown>) => sdkMaybe(supabase.rpc(fn, args as never)) as Promise<T | null>

export const CITIZEN_BUCKET = 'citizen-complaints'
export const CITIZEN_SESSION_KEY = 'citizen.session.v1'

export const citizen = {
  // ─────────── المواطن ───────────
  info() { return rpc<CitizenPortalInfo>('citizen_portal_info', {}) },
  signIn(name: string, phone: string) { return rpc<CitizenSession>('citizen_sign_in', { p_name: name, p_phone: phone }) },
  submitComplaint(token: string, v: { fullName: string; details: string; lat?: number | null; lng?: number | null; address?: string | null; photos?: string[] }) {
    return rpc<CitizenComplaint>('citizen_complaint_submit', {
      p_token: token, p_full_name: v.fullName, p_details: v.details, p_lat: v.lat ?? null, p_lng: v.lng ?? null, p_address: v.address ?? null, p_photos: v.photos ?? null,
    })
  },
  myComplaints(token: string) { return rpc<CitizenComplaint[]>('citizen_my_complaints', { p_token: token }) },
  rateComplaint(token: string, complaintId: string, stars: number) { return sdkVoid(supabase.rpc('citizen_complaint_rate', { p_token: token, p_complaint: complaintId, p_stars: stars } as never)) },
  /** يرفع صورة إلى مجلد token (سياسة التخزين تسمح بهذا المجلد فقط) ويعيد المسار */
  async uploadPhoto(token: string, file: Blob, index: number): Promise<string> {
    const path = `${token}/${Date.now()}-${index}.jpg`
    await sdkGuard(supabase.storage.from(CITIZEN_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false }))
    return path
  },
  chatRequest(token: string) { return rpc<CitizenChat>('citizen_chat_request', { p_token: token }) },
  chatState(token: string, after = 0) { return rpcMaybe<CitizenChat>('citizen_chat_state', { p_token: token, p_after: after }) },
  chatSend(token: string, body: string) { return rpc<number>('citizen_chat_send', { p_token: token, p_body: body }) },
  chatClose(token: string) { return sdkVoid(supabase.rpc('citizen_chat_close', { p_token: token } as never)) },
  chatRate(token: string, sessionId: string, stars: number, note?: string) {
    return sdkVoid(supabase.rpc('citizen_chat_rate', { p_token: token, p_session: sessionId, p_stars: stars, p_note: note ?? null } as never))
  },

  // ─────────── غرفة العمليات ───────────
  opsList(f: { status?: CitizenStatus | null; search?: string | null; from?: string | null; to?: string | null } = {}) {
    return rpc<CitizenComplaint[]>('ops_citizen_complaints_list', { p_status: f.status ?? null, p_search: f.search?.trim() || null, p_from: f.from ?? null, p_to: f.to ?? null, p_limit: 1000 })
  },
  opsManagers() { return rpc<CitizenManager[]>('ops_citizen_managers', {}) },
  opsAssign(complaintId: string, userId: string, note?: string) { return rpc<CitizenComplaint>('ops_citizen_complaint_assign', { p_complaint: complaintId, p_user: userId, p_note: note ?? null }) },
  setStatus(complaintId: string, status: CitizenStatus, note?: string) { return rpc<CitizenComplaint>('citizen_complaint_set_status', { p_complaint: complaintId, p_status: status, p_note: note ?? null }) },
  addNote(complaintId: string, note: string) { return sdkVoid(supabase.rpc('citizen_complaint_add_note', { p_complaint: complaintId, p_note: note } as never)) },
  async photoUrls(paths: string[]): Promise<Record<string, string>> {
    if (!paths.length) return {}
    const rows = await sdkGuard(supabase.storage.from(CITIZEN_BUCKET).createSignedUrls(paths, 1800))
    const out: Record<string, string> = {}
    for (const r of rows ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl
    return out
  },
  opsQueue() { return rpc<CitizenQueueItem[]>('ops_citizen_chat_queue', {}) },
  opsAccept(sessionId: string) { return rpc<CitizenChat>('ops_citizen_chat_accept', { p_session: sessionId }) },
  opsMessages(sessionId: string, after = 0) { return rpc<CitizenChat>('ops_citizen_chat_messages', { p_session: sessionId, p_after: after }) },
  opsSend(sessionId: string, body: string) { return rpc<number>('ops_citizen_chat_send', { p_session: sessionId, p_body: body }) },
  opsClose(sessionId: string) { return sdkVoid(supabase.rpc('ops_citizen_chat_close', { p_session: sessionId } as never)) },
  opsSaveSettings(v: { about: string; phones: Array<{ label: string; number: string }>; hours: string; address?: string | null; orgName?: string | null }) {
    return rpc<CitizenPortalInfo>('ops_citizen_settings_save', { p_about: v.about, p_phones: v.phones, p_hours: v.hours, p_address: v.address ?? null, p_org_name: v.orgName ?? null })
  },

  // ─────────── مسؤول القسم ───────────
  mine() { return rpc<CitizenComplaint[]>('mgr_citizen_complaints', {}) },

  // ─────────── التقارير ───────────
  report(from: string, to: string) { return rpc<CitizenReport>('citizen_complaints_report', { p_from: from, p_to: to }) },
}

/** ضغط صورة في المتصفح قبل الرفع (أقصى ضلع 1600px، JPEG 0.82) — يعمل مع الكاميرا والمعرض */
export async function compressImage(file: File, maxSide = 1600): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d'); if (!ctx) return file
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82))
  } catch { return file }
}
