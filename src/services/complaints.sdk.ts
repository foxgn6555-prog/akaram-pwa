/** SDK دورة الشكاوى — لا وصول إلى Supabase من صفحات البوابات. */
import { sdkGuard, sdkVoid, supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'
import type {
  ComplaintInboxMessage,
  ComplaintInboxMedia,
  ComplaintItem,
  ComplaintItemFields,
  ComplaintManager,
  ComplaintSector,
  ComplaintEmailDelivery,
  ComplaintMedia,
  ComplaintSummary,
  ComplaintTemplate,
  ComplaintContact,
  ComplaintReport,
  ComplaintReportDetail,
  ComplaintItemDetail,
  ComplaintStatusEvent,
  ComplaintSetting,
  SendComplaintEmailInput,
} from '@features/complaints/types'

const inboxCols =
  'id,sender_email,sender_name,reply_to,subject,source_sector,received_at,import_status,attachment_count,duplicate_of'
const itemCols =
  'id,complaint_id,sequence_no,title,municipal_center,neighborhood,alley,location_text,ocr_text,assigned_to,status,manager_notes,reviewer_notes,complaints!inner(reference_no,sector,received_at,status)'

function inboxRow(row: Record<string, unknown>): ComplaintInboxMessage {
  return {
    id: String(row.id),
    senderEmail: String(row.sender_email ?? ''),
    senderName: (row.sender_name as string | null) ?? null,
    replyTo: (row.reply_to as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    sector: (row.source_sector as ComplaintSector | null) ?? null,
    receivedAt: String(row.received_at),
    status: row.import_status as ComplaintInboxMessage['status'],
    attachmentCount: Number(row.attachment_count ?? 0),
    duplicateOf: (row.duplicate_of as string | null) ?? null,
  }
}

function itemRow(row: Record<string, unknown>): ComplaintItem {
  const parent = (row.complaints ?? {}) as Record<string, unknown>
  return {
    id: String(row.id),
    complaintId: String(row.complaint_id),
    referenceNo: String(parent.reference_no ?? ''),
    complaintStatus: String(parent.status ?? ''),
    sector: parent.sector as ComplaintSector,
    sequenceNo: Number(row.sequence_no),
    title: (row.title as string | null) ?? null,
    municipalCenter: (row.municipal_center as string | null) ?? null,
    neighborhood: (row.neighborhood as string | null) ?? null,
    alley: (row.alley as string | null) ?? null,
    locationText: (row.location_text as string | null) ?? null,
    ocrText: (row.ocr_text as string | null) ?? null,
    assignedTo: (row.assigned_to as string | null) ?? null,
    status: row.status as ComplaintItem['status'],
    managerNotes: (row.manager_notes as string | null) ?? null,
    reviewerNotes: (row.reviewer_notes as string | null) ?? null,
    receivedAt: String(parent.received_at ?? ''),
  }
}

export const complaints = {
  async inbox(sector?: ComplaintSector): Promise<ComplaintInboxMessage[]> {
    let query = supabase
      .from('complaint_inbox_messages')
      .select(inboxCols)
      .order('received_at', { ascending: false })
    if (sector) query = query.eq('source_sector', sector)
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(inboxRow)
  },

  async inboxMedia(messageId: string): Promise<ComplaintInboxMedia[]> {
    const rows = await sdkGuard(
      supabase
        .from('complaint_media')
        .select('id,original_name,mime_type,storage_path,sha256')
        .eq('inbox_message_id', messageId)
        .is('item_id', null)
        .order('created_at')
        .returns<Record<string, unknown>[]>(),
    )
    const result: ComplaintInboxMedia[] = []
    const hashes = new Set<string>()
    for (const row of rows ?? []) {
      const path = String(row.storage_path)
      const signed = await sdkGuard(
        supabase.storage.from('complaint-media').createSignedUrl(path, 600),
      )
      const hash = String(row.sha256 ?? '')
      result.push({
        id: String(row.id),
        name: String(row.original_name ?? 'مرفق'),
        mimeType: String(row.mime_type ?? ''),
        url: signed.signedUrl,
        duplicate: Boolean(hash && hashes.has(hash)),
      })
      if (hash) hashes.add(hash)
    }
    return result
  },

  async addInboxPdfPages(messageId: string, sourceId: string, files: File[]): Promise<void> {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new SDKError('جلسة المستخدم غير متاحة', 'UNAUTHENTICATED', authError)
    const user = authData.user
    if (!user) throw new SDKError('جلسة المستخدم غير متاحة', 'UNAUTHENTICATED')
    const userId = user.id
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      if (!file || file.type !== 'image/png') throw new SDKError('صفحة PDF غير صالحة', 'INVALID_PDF_PAGE')
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
      const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      const path = `inbox/${messageId}/pdf-${sourceId}-${index + 1}-${crypto.randomUUID()}.png`
      await sdkGuard(supabase.storage.from('complaint-media').upload(path, file, { contentType: 'image/png' }))
      try {
        await sdkVoid(supabase.from('complaint_media').insert({
          inbox_message_id: messageId, media_kind: 'email_attachment', storage_path: path,
          original_name: file.name, mime_type: 'image/png', size_bytes: file.size,
          sha256, pdf_page: index + 1, source: 'email', uploaded_by: userId,
        } as never))
      } catch (error) {
        await supabase.storage.from('complaint-media').remove([path])
        throw error
      }
    }
  },

  async createItemFromInbox(
    messageId: string,
    mediaIds: string[],
    fields: ComplaintItemFields,
  ): Promise<string> {
    const data = await sdkGuard(
      supabase.rpc('complaint_create_item_from_inbox', {
        p_message_id: messageId,
        p_media_ids: mediaIds,
        p_fields: {
          title: fields.title ?? null,
          municipal_center: fields.municipalCenter ?? null,
          neighborhood: fields.neighborhood ?? null,
          alley: fields.alley ?? null,
          location_text: fields.locationText ?? null,
          ocr_text: fields.ocrText ?? null,
        },
      }),
    )
    return String(data)
  },

  async items(mine = false): Promise<ComplaintItem[]> {
    let query = supabase.from('complaint_items').select(itemCols).order('created_at', { ascending: false })
    if (mine) {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return []
      query = query.eq('assigned_to', data.user.id)
    }
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(itemRow)
  },

  async managers(): Promise<ComplaintManager[]> {
    const result = await sdkGuard(supabase.rpc('complaint_list_managers'))
    const rows = (result ?? []) as unknown as Array<Record<string, unknown>>
    return rows.map((row) => ({
      userId: String(row.user_id),
      fullName: String(row.full_name),
      jobTitle: (row.job_title as string | null) ?? null,
    }))
  },

  async assign(itemId: string, managerId: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_assign_item', { p_item_id: itemId, p_manager_id: managerId }))
  },

  async start(itemId: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_start_item', { p_item_id: itemId }))
  },

  async uploadAfter(itemId: string, file: File, location?: { latitude: number; longitude: number }): Promise<void> {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `item/${itemId}/after/${crypto.randomUUID()}.${extension}`
    await sdkGuard(supabase.storage.from('complaint-media').upload(path, file, { contentType: file.type }))
    const { data } = await supabase.auth.getUser()
    await sdkVoid(supabase.from('complaint_media').insert({
      item_id: itemId,
      media_kind: 'after',
      storage_path: path,
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      captured_at: new Date().toISOString(),
      source: 'gallery',
      uploaded_by: data.user?.id ?? null,
    } as never))
  },

  async complete(itemId: string, notes?: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_complete_item', { p_item_id: itemId, p_notes: notes ?? null }))
  },

  async itemMedia(itemId: string): Promise<ComplaintMedia[]> {
    const rows = await sdkGuard(supabase.from('complaint_media')
      .select('id,media_kind,storage_path,original_name,mime_type,captured_at').eq('item_id', itemId)
      .order('created_at').returns<Record<string, unknown>[]>() )
    return Promise.all((rows ?? []).map(async (row) => {
      const signed = await sdkGuard(supabase.storage.from('complaint-media')
        .createSignedUrl(String(row.storage_path), 600))
      return { id: String(row.id), kind: row.media_kind as ComplaintMedia['kind'], url: signed.signedUrl,
        name: String(row.original_name ?? 'صورة'), mimeType: String(row.mime_type), capturedAt: (row.captured_at as string | null) ?? null }
    }))
  },

  async itemDetail(itemId: string): Promise<ComplaintItemDetail> {
    const row = await sdkGuard(supabase.from('complaint_items').select(itemCols).eq('id', itemId)
      .returns<Record<string, unknown>>().single())
    if (!row) throw new Error('تعذر العثور على الشكوى المطلوبة')
    const item = itemRow(row)
    const [media, historyRows, parent] = await Promise.all([
      complaints.itemMedia(itemId),
      sdkGuard(supabase.from('complaint_status_history')
        .select('id,from_status,to_status,note,actor_id,created_at').eq('item_id', itemId)
        .order('created_at').returns<Record<string, unknown>[]>()),
      sdkGuard(supabase.from('complaints')
        .select('sender_email,inbox_message_id,complaint_inbox_messages(subject,body_text)')
        .eq('id', item.complaintId).returns<Record<string, unknown>>().single()),
    ])
    const parentRow = parent as Record<string, unknown> | null
    if (!parentRow) throw new Error('تعذر العثور على رسالة الشكوى الأصلية')
    const inbox = (parentRow.complaint_inbox_messages ?? null) as Record<string, unknown> | null
    const history: ComplaintStatusEvent[] = (historyRows ?? []).map((event) => ({
      id: String(event.id), fromStatus: (event.from_status as string | null) ?? null,
      toStatus: String(event.to_status), note: (event.note as string | null) ?? null,
      actorId: (event.actor_id as string | null) ?? null, createdAt: String(event.created_at),
    }))
    return { item, media, history, senderEmail: (parentRow.sender_email as string | null) ?? null,
      subject: (inbox?.subject as string | null) ?? null, bodyText: (inbox?.body_text as string | null) ?? null,
      inboxMessageId: (parentRow.inbox_message_id as string | null) ?? null }
  },

  async updateItem(itemId: string, fields: ComplaintItemFields): Promise<void> {
    await sdkVoid(supabase.from('complaint_items').update({
      title: fields.title, municipal_center: fields.municipalCenter,
      neighborhood: fields.neighborhood, alley: fields.alley, location_text: fields.locationText,
    } as never).eq('id', itemId))
  },

  async reviewItem(itemId: string, approved: boolean, note?: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_review_item', {
      p_item_id: itemId, p_approved: approved, p_note: note ?? null,
    }))
  },

  async summary(): Promise<ComplaintSummary> {
    const data = await sdkGuard(supabase.rpc('complaint_dashboard_summary'))
    return data as unknown as ComplaintSummary
  },

  async templates(): Promise<ComplaintTemplate[]> {
    const rows = await sdkGuard(supabase.from('complaint_templates').select('*').order('created_at')
      .returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({ id: String(row.id), name: String(row.name),
      description: (row.description as string | null) ?? null, sector: (row.sector as ComplaintSector | null) ?? null,
      layout: (row.layout as Record<string, unknown>) ?? {}, isDefault: Boolean(row.is_default),
      isActive: Boolean(row.is_active), version: Number(row.version) }))
  },

  async saveTemplate(input: Omit<ComplaintTemplate, 'id' | 'version'> & { id?: string }): Promise<void> {
    const payload = { name: input.name, description: input.description, sector: input.sector,
      layout: input.layout, is_default: input.isDefault, is_active: input.isActive }
    if (input.id) await sdkVoid(supabase.from('complaint_templates').update(payload as never).eq('id', input.id))
    else await sdkVoid(supabase.from('complaint_templates').insert(payload as never))
  },

  async contacts(): Promise<ComplaintContact[]> {
    const rows = await sdkGuard(supabase.from('complaint_contacts').select('*').order('created_at')
      .returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({ id: String(row.id), sector: (row.sector as ComplaintSector | null) ?? null,
      name: String(row.name), email: String(row.email), kind: row.kind as ComplaintContact['kind'],
      isActive: Boolean(row.is_active) }))
  },

  async saveContact(input: Omit<ComplaintContact, 'id'> & { id?: string }): Promise<void> {
    const payload = { sector: input.sector, name: input.name, email: input.email,
      kind: input.kind, is_active: input.isActive }
    if (input.id) await sdkVoid(supabase.from('complaint_contacts').update(payload as never).eq('id', input.id))
    else await sdkVoid(supabase.from('complaint_contacts').insert(payload as never))
  },

  async settings(): Promise<ComplaintSetting[]> {
    const rows = await sdkGuard(supabase.from('complaint_settings').select('key,value,description').order('key')
      .returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({ key: String(row.key), value: (row.value as Record<string, unknown>) ?? {},
      description: (row.description as string | null) ?? null }))
  },

  async saveSetting(setting: ComplaintSetting): Promise<void> {
    await sdkVoid(supabase.from('complaint_settings').upsert({ key: setting.key, value: setting.value,
      description: setting.description } as never, { onConflict: 'key' }))
  },

  async reports(): Promise<ComplaintReport[]> {
    const rows = await sdkGuard(supabase.from('complaint_reports').select('*')
      .order('report_date', { ascending: false }).returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({ id: String(row.id), reportDate: String(row.report_date),
      sector: row.sector as ComplaintSector, title: String(row.title), status: row.status as ComplaintReport['status'],
      pptxPath: (row.pptx_path as string | null) ?? null, recipients: (row.recipients as string[]) ?? [],
      deliveryId: (row.delivery_id as string | null) ?? null, createdAt: String(row.created_at) }))
  },

  async reportDetail(reportId: string): Promise<ComplaintReportDetail> {
    const reportRow = await sdkGuard(supabase.from('complaint_reports').select('*').eq('id', reportId)
      .returns<Record<string, unknown>>().single())
    const reportData = reportRow as Record<string, unknown> | null
    if (!reportData) throw new Error('تعذر العثور على التقرير المطلوب')
    const [links, deliveries] = await Promise.all([
      sdkGuard(supabase.from('complaint_report_items')
        .select(`item_id,display_order,included,slide_layout,complaint_items!inner(${itemCols})`)
        .eq('report_id', reportId).order('display_order').returns<Record<string, unknown>[]>()),
      complaints.deliveries(undefined, reportId),
    ])
    const report: ComplaintReport = { id: String(reportData.id), reportDate: String(reportData.report_date),
      sector: reportData.sector as ComplaintSector, title: String(reportData.title),
      status: reportData.status as ComplaintReport['status'], pptxPath: (reportData.pptx_path as string | null) ?? null,
      recipients: (reportData.recipients as string[]) ?? [], deliveryId: (reportData.delivery_id as string | null) ?? null,
      createdAt: String(reportData.created_at) }
    return { ...report, layout: (reportData.layout as Record<string, unknown>) ?? {},
      approvedAt: (reportData.approved_at as string | null) ?? null,
      sentAt: (reportData.sent_at as string | null) ?? null,
      archivedAt: (reportData.archived_at as string | null) ?? null, deliveries,
      items: (links ?? []).map((link) => ({ itemId: String(link.item_id), displayOrder: Number(link.display_order),
        included: Boolean(link.included), slideLayout: (link.slide_layout as Record<string, unknown>) ?? {},
        item: itemRow(link.complaint_items as Record<string, unknown>) })) }
  },

  async saveReportDraft(detail: Pick<ComplaintReportDetail, 'id' | 'title' | 'layout' | 'recipients' | 'items'>): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_update_report_draft', {
      p_report_id: detail.id, p_title: detail.title, p_layout: detail.layout, p_recipients: detail.recipients,
      p_items: detail.items.map((entry) => ({ itemId: entry.itemId, displayOrder: entry.displayOrder,
        included: entry.included, slideLayout: entry.slideLayout })),
    }))
  },

  async prepareReport(sector: ComplaintSector, date: string, templateId?: string): Promise<string> {
    const data = await sdkGuard(supabase.rpc('complaint_prepare_daily_report', {
      p_sector: sector, p_date: date, p_template_id: templateId ?? null,
    }))
    return String(data)
  },

  async setReportStatus(reportId: string, status: ComplaintReport['status']): Promise<void> {
    if (status !== 'approved') throw new SDKError('انتقال حالة التقرير غير مسموح', 'REPORT_TRANSITION_INVALID')
    await sdkVoid(supabase.rpc('complaint_approve_report', { p_report_id: reportId }))
  },

  async generateReport(reportId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke<{ path: string }>('complaint-generate-report', {
      body: { reportId },
    })
    if (error || !data?.path) throw new SDKError('تعذر إنشاء ملف PowerPoint', 'REPORT_GENERATION_FAILED', error)
    return data.path
  },

  async reportDownloadUrl(path: string): Promise<string> {
    const data = await sdkGuard(supabase.storage.from('complaint-media').createSignedUrl(path, 600, {
      download: true,
    }))
    return data.signedUrl
  },

  async sendEmail(input: SendComplaintEmailInput): Promise<{ deliveryId: string }> {
    const { data, error } = await supabase.functions.invoke<{ deliveryId: string }>('mailgun-send', {
      body: input,
    })
    if (error || !data?.deliveryId) {
      throw new SDKError('تعذر إرسال التقرير عبر مزود البريد', 'MAILGUN_SEND_FAILED', error)
    }
    return data
  },

  async deliveries(complaintId?: string, reportId?: string): Promise<ComplaintEmailDelivery[]> {
    let query = supabase.from('complaint_email_deliveries')
      .select('id,recipients,subject,status,error_message,created_at,delivered_at')
      .order('created_at', { ascending: false })
    if (complaintId) query = query.eq('complaint_id', complaintId)
    if (reportId) query = query.eq('report_id', reportId)
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({
      id: String(row.id),
      recipients: (row.recipients as string[]) ?? [],
      subject: String(row.subject ?? ''),
      status: row.status as ComplaintEmailDelivery['status'],
      errorMessage: (row.error_message as string | null) ?? null,
      createdAt: String(row.created_at),
      deliveredAt: (row.delivered_at as string | null) ?? null,
    }))
  },
}
