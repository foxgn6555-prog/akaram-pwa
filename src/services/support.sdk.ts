/**
 * SDK الدعم الفني (الجولة ٥) — متاح من كل البوابات.
 *  · contact: رقم الدعم وساعات العمل
 *  · create: إنشاء تذكرة (نص + حتى 3 صور) — المرفقات تُرفع في مجلد صاحبها فقط
 *  · list / decide: بوابة تقنية المعلومات (محروسة في الخادم)
 */
import { sdkGuard, sdkVoid, supabase } from './client'

export const SUPPORT_BUCKET = 'support-attachments'

export type SupportCategory = 'hardware' | 'software' | 'network' | 'account' | 'other'
export type SupportPriority = 'low' | 'medium' | 'high' | 'critical'
export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface SupportTicket {
  id: string
  ticket_number: number
  created_by: string
  requester_name: string | null
  contact_phone: string | null
  source_portal: string | null
  category: SupportCategory
  priority: SupportPriority
  status: SupportStatus
  title: string
  description: string
  attachment_paths: string[]
  admin_note: string | null
  created_at: string
  resolved_at: string | null
}

export const support = {
  async contact(): Promise<{ phone: string | null; hours: string | null; online: boolean }> {
    return sdkGuard(supabase.rpc('support_contact')) as Promise<{ phone: string | null; hours: string | null; online: boolean }>
  },

  /** يرفع صورة إلى مجلد المستخدم الحالي ويُعيد مسارها */
  async uploadImage(file: File): Promise<string> {
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) throw new Error('PERMISSION_DENIED')
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${userId}/${crypto.randomUUID()}.${ext}`
    await sdkVoid(supabase.storage.from(SUPPORT_BUCKET).upload(path, file, { contentType: file.type, upsert: false }))
    return path
  },

  async create(input: {
    title: string
    description: string
    category: SupportCategory
    priority: SupportPriority
    portal?: string | null
    phone?: string | null
    attachments?: string[]
  }): Promise<{ id: string; ticket_number: number }> {
    return sdkGuard(
      supabase.rpc('support_ticket_create', {
        p_title: input.title,
        p_description: input.description,
        p_category: input.category,
        p_priority: input.priority,
        p_source_portal: input.portal ?? null,
        p_contact_phone: input.phone ?? null,
        p_attachments: input.attachments ?? [],
      }),
    ) as Promise<{ id: string; ticket_number: number }>
  },

  async list(status?: SupportStatus | null): Promise<SupportTicket[]> {
    return sdkGuard(supabase.rpc('support_tickets_list', { p_status: status ?? null })) as Promise<SupportTicket[]>
  },

  async decide(id: string, status: SupportStatus, note?: string | null): Promise<void> {
    await sdkVoid(supabase.rpc('support_ticket_decide', { p_id: id, p_status: status, p_note: note ?? null }))
  },

  /** روابط موقّتة لعرض مرفقات تذكرة (IT) */
  async attachmentUrls(paths: readonly string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {}
    const { data } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrls([...paths], 600)
    const out: Record<string, string> = {}
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out[row.path] = row.signedUrl
    }
    return out
  },
}
