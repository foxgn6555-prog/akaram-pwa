/** SDK دورة الشكاوى — لا وصول إلى Supabase من صفحات البوابات. */
import { sdkGuard, sdkMaybe, sdkVoid, supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'
import { baghdadDayRange } from '@features/complaints/lib/baghdad-date'
import type {
  ComplaintInboxMessage,
  ComplaintInboxMedia,
  ComplaintInboxMediaPage,
  ComplaintSortEntry,
  ComplaintBatchSortResult,
  ComplaintItem,
  ComplaintItemFields,
  ComplaintManager,
  ComplaintSector,
  ComplaintEmailDelivery,
  ComplaintMedia,
  ComplaintAfterUpload,
  ComplaintTicketAfterUpload,
  ComplaintSummary,
  ComplaintAnalytics,
  ComplaintTemplate,
  ComplaintContact,
  ComplaintReport,
  ComplaintReportDetail,
  ComplaintItemDetail,
  ComplaintStatusEvent,
  ComplaintSetting,
  ComplaintArchiveFolder,
  ComplaintDeletionRequest,
  SendComplaintEmailInput,
} from '@features/complaints/types'

const inboxCols =
  'id,sender_email,sender_name,reply_to,subject,body_text,source_sector,received_at,import_status,attachment_count,duplicate_of'
const itemCols =
  'id,complaint_id,sequence_no,title,municipal_center,neighborhood,alley,location_text,ocr_text,assigned_to,status,manager_notes,reviewer_notes,complaints!inner(reference_no,sector,received_at,status,inbox_message_id,complaint_inbox_messages(subject))'

function validImageSignature(bytes:Uint8Array,mime:string):boolean{
  if(mime==='image/png')return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a
  if(mime==='image/webp')return bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50
  return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
}

async function mapBatches<T,R>(values:T[],size:number,worker:(value:T,index:number)=>Promise<R>):Promise<R[]>{
  const output:R[]=[]
  for(let offset=0;offset<values.length;offset+=size){
    const batch=values.slice(offset,offset+size)
    const settled=await Promise.allSettled(batch.map((value,index)=>worker(value,offset+index)))
    const failure=settled.find((result):result is PromiseRejectedResult=>result.status==='rejected')
    if(failure)throw failure.reason
    output.push(...settled.map(result=>(result as PromiseFulfilledResult<R>).value))
  }
  return output
}

function inboxRow(row: Record<string, unknown>): ComplaintInboxMessage {
  return {
    id: String(row.id),
    senderEmail: String(row.sender_email ?? ''),
    senderName: (row.sender_name as string | null) ?? null,
    replyTo: (row.reply_to as string | null) ?? null,
    subject: (row.subject as string | null) ?? null,
    bodyText: (row.body_text as string | null) ?? null,
    sector: (row.source_sector as ComplaintSector | null) ?? null,
    receivedAt: String(row.received_at),
    status: row.import_status as ComplaintInboxMessage['status'],
    attachmentCount: Number(row.attachment_count ?? 0),
    duplicateOf: (row.duplicate_of as string | null) ?? null,
  }
}

function itemRow(row: Record<string, unknown>): ComplaintItem {
  const parent = (row.complaints ?? {}) as Record<string, unknown>
  const inbox = (parent.complaint_inbox_messages ?? {}) as Record<string, unknown>
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
    inboxMessageId: (parent.inbox_message_id as string | null) ?? null,
    ticketName: String(inbox.subject ?? parent.reference_no ?? 'تذكرة شكاوى'),
  }
}

export const complaints = {
  async inbox(sector?: ComplaintSector, date?: string): Promise<ComplaintInboxMessage[]> {
    let query = supabase
      .from('complaint_inbox_messages')
      .select(inboxCols)
      .is('archived_at',null)
      .order('received_at', { ascending: false })
    if (sector) query = query.eq('source_sector', sector)
    if(date){const{from,to}=baghdadDayRange(date);query=query.gte('received_at',from).lt('received_at',to)}
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(inboxRow)
  },

  async inboxMedia(messageId: string): Promise<ComplaintInboxMedia[]> {
    const data = await sdkGuard(supabase.rpc('complaint_inbox_media_detail', { p_message_id: messageId }))
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    return Promise.all(rows.map(async (row) => {
      const path = String(row.storagePath ?? '')
      const signed = await sdkGuard(supabase.storage.from('complaint-media').createSignedUrl(path, 600))
      const duplicateCount = Number(row.duplicateCount ?? 0)
      return {
        id: String(row.id), mediaCode: String(row.mediaCode), name: String(row.name ?? 'مرفق'),
        mimeType: String(row.mimeType ?? ''), url: signed.signedUrl,
        duplicate: duplicateCount > 0, duplicateCount, itemId: (row.itemId as string | null) ?? null,
      }
    }))
  },

  async inboxMediaPage(messageId: string, page: number, pageSize: number): Promise<ComplaintInboxMediaPage> {
    const limit = Math.min(100, Math.max(12, Math.trunc(pageSize)))
    const offset = Math.max(0, Math.trunc(page) - 1) * limit
    const data = await sdkGuard(supabase.rpc('complaint_inbox_media_page', {
      p_message_id: messageId, p_limit: limit, p_offset: offset,
    }))
    const result = (data ?? {}) as Record<string, unknown>
    const sourceRows = Array.isArray(result.rows) ? result.rows as Record<string, unknown>[] : []
    const rows = await mapBatches(sourceRows, 8, async (row) => {
      const path = String(row.storagePath ?? '')
      const signed = await sdkGuard(supabase.storage.from('complaint-media').createSignedUrl(path, 600))
      const duplicateCount = Number(row.duplicateCount ?? 0)
      return {
        id: String(row.id), mediaCode: String(row.mediaCode), name: String(row.name ?? 'مرفق'),
        mimeType: String(row.mimeType ?? ''), url: signed.signedUrl,
        duplicate: duplicateCount > 0, duplicateCount, itemId: (row.itemId as string | null) ?? null,
      }
    })
    return {
      rows,
      totalCount: Number(result.totalCount ?? 0),
      imageCount: Number(result.imageCount ?? 0),
      sortedImageCount: Number(result.sortedImageCount ?? 0),
      remainingImageCount: Number(result.remainingImageCount ?? 0),
    }
  },

  async addInboxPdfPages(messageId: string, sourceId: string, files: File[], startPage = 1): Promise<void> {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new SDKError('جلسة المستخدم غير متاحة', 'UNAUTHENTICATED', authError)
    const user = authData.user
    if (!user) throw new SDKError('جلسة المستخدم غير متاحة', 'UNAUTHENTICATED')
    const userId = user.id
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      if (!file || !['image/jpeg', 'image/png'].includes(file.type)) throw new SDKError('صفحة PDF غير صالحة', 'INVALID_PDF_PAGE')
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
      const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      const pageNumber = startPage + index
      const extension = file.type === 'image/jpeg' ? 'jpg' : 'png'
      const path = `inbox/${messageId}/pdf-${sourceId}-${pageNumber}-${sha256}.${extension}`
      const existing = await sdkMaybe(supabase.from('complaint_media').select('id').eq('storage_path', path).maybeSingle())
      if (existing) continue
      await sdkGuard(supabase.storage.from('complaint-media').upload(path, file, { contentType: file.type }))
      try {
        await sdkVoid(supabase.from('complaint_media').insert({
          inbox_message_id: messageId, media_kind: 'email_attachment', storage_path: path,
          original_name: file.name, mime_type: file.type, size_bytes: file.size,
          sha256, pdf_page: pageNumber, source: 'email', uploaded_by: userId,
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

  async batchCreateItemsFromInbox(messageId: string, entries: ComplaintSortEntry[]): Promise<ComplaintBatchSortResult> {
    const data = await sdkGuard(supabase.rpc('complaint_batch_create_items_from_inbox', {
      p_message_id: messageId,
      p_entries: entries.map((entry) => ({
        mediaId: entry.mediaId, title: entry.title ?? null,
        municipalCenter: entry.municipalCenter ?? null, neighborhood: entry.neighborhood ?? null,
        alley: entry.alley ?? null, locationText: entry.locationText ?? null, ocrText: entry.ocrText ?? null,
      })),
    }))
    const result = (data ?? {}) as Record<string, unknown>
    return {
      complaintId: String(result.complaintId), itemIds: (result.itemIds as string[]) ?? [],
      createdCount: Number(result.createdCount ?? 0), remainingCount: Number(result.remainingCount ?? 0),
    }
  },

  async items(mine = false, date?: string): Promise<ComplaintItem[]> {
    let query = supabase.from('complaint_items').select(itemCols).order('created_at', { ascending: false })
    if (mine) {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return []
      query = query.eq('assigned_to', data.user.id)
    }
    if(date){const{from,to}=baghdadDayRange(date);query=query.gte('complaints.received_at',from).lt('complaints.received_at',to)}
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(itemRow)
  },

  async managerTicket(complaintId:string):Promise<ComplaintItem[]>{
    const rows=await sdkGuard(supabase.from('complaint_items').select(itemCols).eq('complaint_id',complaintId).order('sequence_no').returns<Record<string,unknown>[]>() )
    return(rows??[]).map(itemRow)
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

  async assignBatch(itemIds: string[], managerId: string): Promise<number> {
    const data = await sdkGuard(supabase.rpc('complaint_assign_items', {
      p_item_ids: itemIds, p_manager_id: managerId,
    }))
    return Number(data ?? 0)
  },

  async start(itemId: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_start_item', { p_item_id: itemId }))
  },

  async startAssignmentTicket(complaintId:string):Promise<number>{
    return Number(await sdkGuard(supabase.rpc('complaint_start_assignment_ticket',{p_complaint_id:complaintId})))
  },

  async completeAssignmentTicket(complaintId:string,uploads:ComplaintTicketAfterUpload[],notes?:string):Promise<number>{
    if(!uploads.length||uploads.length>100||new Set(uploads.map(value=>value.itemId)).size!==uploads.length)
      throw new SDKError('يجب توفير صورة معالجة واحدة لكل تلكؤ دون تكرار','COMPLAINT_TICKET_FILES_COUNT_MISMATCH')
    const allowed=new Set(['image/jpeg','image/png','image/webp'])
    if(uploads.some(({file})=>!allowed.has(file.type)||file.size<1||file.size>25*1024*1024)||uploads.reduce((sum,{file})=>sum+file.size,0)>500*1024*1024)
      throw new SDKError('إحدى صور المعالجة غير صالحة أو كبيرة جداً','COMPLAINT_TICKET_FILE_INVALID')
    const paths:string[]=[]
    try{
      const metadata=await mapBatches(uploads,4,async upload=>{const{file,itemId}=upload;const bytes=new Uint8Array(await file.arrayBuffer());if(!validImageSignature(bytes,file.type))throw new SDKError('محتوى إحدى الصور لا يطابق نوع JPG أو PNG أو WebP','COMPLAINT_TICKET_FILE_SIGNATURE_INVALID');const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`item/${itemId}/after/${crypto.randomUUID()}.${extension}`;paths.push(path);const digest=await crypto.subtle.digest('SHA-256',bytes);const sha256=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');await sdkGuard(supabase.storage.from('complaint-media').upload(path,file,{contentType:file.type}));return{itemId,storagePath:path,originalName:file.name,mimeType:file.type,sizeBytes:file.size,sha256,source:upload.source}})
      return Number(await sdkGuard(supabase.rpc('complaint_complete_assignment_ticket',{p_complaint_id:complaintId,p_files:metadata,p_notes:notes?.trim()||null})))
    }catch(error){if(paths.length)await supabase.storage.from('complaint-media').remove(paths);throw error}
  },

  async uploadAfter(itemId: string, file: File, location?: { latitude: number; longitude: number }): Promise<void> {
    await complaints.uploadAfterBatch(itemId,[{file,source:'gallery'}],location)
  },

  async uploadAfterBatch(itemId:string,uploads:ComplaintAfterUpload[],location?:{latitude:number;longitude:number}):Promise<string[]> {
    if(!uploads.length||uploads.length>20)throw new SDKError('اختر من 1 إلى 20 صورة معالجة','COMPLAINT_AFTER_FILES_LIMIT')
    const allowed=new Set(['image/jpeg','image/png','image/webp'])
    if(location&&(!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude)||Math.abs(location.latitude)>90||Math.abs(location.longitude)>180))
      throw new SDKError('إحداثيات موقع المعالجة غير صالحة','COMPLAINT_AFTER_LOCATION_INVALID')
    if(uploads.some(({file})=>!allowed.has(file.type)||file.size<1||file.size>25*1024*1024)||uploads.reduce((sum,{file})=>sum+file.size,0)>100*1024*1024)
      throw new SDKError('صور المعالجة غير صالحة أو يتجاوز مجموعها 100MB','COMPLAINT_AFTER_FILE_INVALID')
    const paths:string[]=[]
    try{
      const metadata=[]
      for(let index=0;index<uploads.length;index+=1){const upload=uploads[index]!;const file=upload.file
        if(!allowed.has(file.type)||file.size<1||file.size>25*1024*1024)throw new SDKError('إحدى صور المعالجة غير صالحة أو كبيرة جداً','COMPLAINT_AFTER_FILE_INVALID')
        const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`item/${itemId}/after/${crypto.randomUUID()}.${extension}`;paths.push(path)
        const bytes=new Uint8Array(await file.arrayBuffer());if(!validImageSignature(bytes,file.type))throw new SDKError('محتوى الصورة لا يطابق نوع الملف','COMPLAINT_AFTER_FILE_SIGNATURE_INVALID');const digest=await crypto.subtle.digest('SHA-256',bytes);const sha256=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
        await sdkGuard(supabase.storage.from('complaint-media').upload(path,file,{contentType:file.type}))
        metadata.push({storagePath:path,originalName:file.name,mimeType:file.type,sizeBytes:file.size,sha256,
          latitude:location?.latitude??null,longitude:location?.longitude??null,source:upload.source,displayOrder:index+1})
      }
      const data=await sdkGuard(supabase.rpc('complaint_register_after_media',{p_item_id:itemId,p_files:metadata}))
      return(data??[])as string[]
    }catch(error){if(paths.length)await supabase.storage.from('complaint-media').remove(paths);throw error}
  },

  async complete(itemId: string, notes?: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_complete_item', { p_item_id: itemId, p_notes: notes ?? null }))
  },

  async itemMedia(itemId: string, includeInactive = false): Promise<ComplaintMedia[]> {
    let query = supabase.from('complaint_media')
      .select('id,item_id,media_code,media_kind,storage_path,original_name,mime_type,captured_at,is_active,replacement_reason,superseded_at,display_order')
      .eq('item_id', itemId)
    if (!includeInactive) query = query.eq('is_active', true)
    const rows = await sdkGuard(query.order('display_order').order('created_at').returns<Record<string, unknown>[]>() )
    return Promise.all((rows ?? []).map(async (row) => {
      const signed = await sdkGuard(supabase.storage.from('complaint-media')
        .createSignedUrl(String(row.storage_path), 600))
      return { id: String(row.id), itemId: (row.item_id as string | null) ?? null, mediaCode: String(row.media_code), kind: row.media_kind as ComplaintMedia['kind'], url: signed.signedUrl,
        name: String(row.original_name ?? 'صورة'), mimeType: String(row.mime_type), capturedAt: (row.captured_at as string | null) ?? null,
        isActive: row.is_active !== false, replacementReason: (row.replacement_reason as string | null) ?? null,
        supersededAt: (row.superseded_at as string | null) ?? null, displayOrder:Number(row.display_order??1) }
    }))
  },

  async itemsMedia(itemIds: string[]): Promise<ComplaintMedia[]> {
    const unique=[...new Set(itemIds)]
    if(unique.length===0)return[]
    const rows=await sdkGuard(supabase.from('complaint_media').select('id,item_id,media_code,media_kind,storage_path,original_name,mime_type,captured_at,is_active,replacement_reason,superseded_at,display_order').in('item_id',unique).eq('is_active',true).order('display_order').order('created_at').returns<Record<string,unknown>[]>() )
    return mapBatches(rows??[],8,async row=>{const signed=await sdkGuard(supabase.storage.from('complaint-media').createSignedUrl(String(row.storage_path),600));return{id:String(row.id),itemId:(row.item_id as string|null)??null,mediaCode:String(row.media_code),kind:row.media_kind as ComplaintMedia['kind'],url:signed.signedUrl,name:String(row.original_name??'صورة'),mimeType:String(row.mime_type),capturedAt:(row.captured_at as string|null)??null,isActive:row.is_active!==false,replacementReason:(row.replacement_reason as string|null)??null,supersededAt:(row.superseded_at as string|null)??null,displayOrder:Number(row.display_order??1)}})
  },

  async itemDetail(itemId: string): Promise<ComplaintItemDetail> {
    const row = await sdkGuard(supabase.from('complaint_items').select(itemCols).eq('id', itemId)
      .returns<Record<string, unknown>>().single())
    if (!row) throw new Error('تعذر العثور على الشكوى المطلوبة')
    const item = itemRow(row)
    const [media, historyRows, parent] = await Promise.all([
      complaints.itemMedia(itemId, true),
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

  async updateItemDuringReview(itemId: string, fields: ComplaintItemFields, reason: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_update_item_during_review', {
      p_item_id: itemId, p_neighborhood: fields.neighborhood ?? null, p_alley: fields.alley ?? null,
      p_municipal_center: fields.municipalCenter ?? null, p_location_text: fields.locationText ?? null,
      p_reason: reason,
    }))
  },

  async replaceItemMedia(itemId: string, oldMediaId: string, kind: 'before' | 'after', file: File, reason: string): Promise<string> {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size<1 || file.size>25*1024*1024) {
      throw new SDKError('ملف الصورة البديلة غير صالح', 'COMPLAINT_MEDIA_FILE_INVALID')
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!validImageSignature(bytes,file.type)) throw new SDKError('محتوى الصورة البديلة لا يطابق نوع الملف','COMPLAINT_MEDIA_FILE_SIGNATURE_INVALID')
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2,'0')).join('')
    const extension = file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
    const path = `item/${itemId}/review-${kind}/${crypto.randomUUID()}.${extension}`
    await sdkGuard(supabase.storage.from('complaint-media').upload(path, file, { contentType:file.type }))
    try {
      const data = await sdkGuard(supabase.rpc('complaint_replace_item_media', {
        p_item_id:itemId,p_old_media_id:oldMediaId,p_storage_path:path,p_original_name:file.name,
        p_mime_type:file.type,p_size_bytes:file.size,p_sha256:sha256,p_reason:reason,
      }))
      return String(data)
    } catch (error) {
      await supabase.storage.from('complaint-media').remove([path])
      throw error
    }
  },

  async reviewItem(itemId: string, approved: boolean, note?: string): Promise<void> {
    await sdkVoid(supabase.rpc('complaint_review_item', {
      p_item_id: itemId, p_approved: approved, p_note: note ?? null,
    }))
  },

  async reviewAssignmentTicket(complaintId:string,managerId:string,approved:boolean,note?:string):Promise<number>{
    return Number(await sdkGuard(supabase.rpc('complaint_review_assignment_ticket',{p_complaint_id:complaintId,p_manager_id:managerId,p_approved:approved,p_note:note?.trim()||null})))
  },

  async summary(): Promise<ComplaintSummary> {
    const data = await sdkGuard(supabase.rpc('complaint_dashboard_summary'))
    return data as unknown as ComplaintSummary
  },

  async analytics(from: string, to: string, sector?: ComplaintSector): Promise<ComplaintAnalytics> {
    const data=await sdkGuard(supabase.rpc('complaint_analytics',{p_from:from,p_to:to,p_sector:sector??null}))
    return data as unknown as ComplaintAnalytics
  },

  async templates(): Promise<ComplaintTemplate[]> {
    const rows = await sdkGuard(supabase.from('complaint_templates').select('*').order('created_at')
      .returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({ id: String(row.id), name: String(row.name),
      description: (row.description as string | null) ?? null, sector: (row.sector as ComplaintSector | null) ?? null,
      layout: (row.layout as Record<string, unknown>) ?? {}, isDefault: Boolean(row.is_default),
      isActive: Boolean(row.is_active), version: Number(row.version) }))
  },

  async saveTemplate(input: Omit<ComplaintTemplate, 'id' | 'version'> & { id?: string }): Promise<string> {
    const data = await sdkGuard(supabase.rpc('complaint_save_template', {
      p_template_id: input.id ?? null,
      p_name: input.name,
      p_description: input.description,
      p_sector: input.sector,
      p_layout: input.layout,
      p_is_default: input.isDefault,
      p_is_active: input.isActive,
    }))
    return String(data)
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

  async archiveFolders():Promise<ComplaintArchiveFolder[]>{const rows=await sdkGuard(supabase.from('complaint_archive_folders').select('*').is('restored_at',null).is('permanently_deleted_at',null).order('archived_at',{ascending:false}).returns<Record<string,unknown>[]>());return(rows??[]).map(row=>({id:String(row.id),inboxMessageId:(row.inbox_message_id as string|null)??null,subject:String(row.subject),senderEmail:String(row.sender_email),sector:row.sector as ComplaintArchiveFolder['sector'],archivedAt:String(row.archived_at),restoredAt:(row.restored_at as string|null)??null,permanentlyDeletedAt:(row.permanently_deleted_at as string|null)??null,snapshot:(row.snapshot as Record<string,unknown>)??{}}))},
  async deletionRequests():Promise<ComplaintDeletionRequest[]>{const rows=await sdkGuard(supabase.from('complaint_deletion_requests').select('*').order('requested_at',{ascending:false}).returns<Record<string,unknown>[]>());return(rows??[]).map(row=>({id:String(row.id),folderId:String(row.folder_id),reason:String(row.reason),status:row.status as ComplaintDeletionRequest['status'],requestedAt:String(row.requested_at),decidedAt:(row.decided_at as string|null)??null,decisionNote:(row.decision_note as string|null)??null,errorMessage:(row.error_message as string|null)??null,attemptCount:Number(row.attempt_count??0),executionStartedAt:(row.execution_started_at as string|null)??null}))},
  async archiveEmail(messageId:string,reason:string):Promise<string>{return String(await sdkGuard(supabase.rpc('complaint_archive_email',{p_message_id:messageId,p_reason:reason})))},
  async restoreEmail(folderId:string):Promise<void>{await sdkVoid(supabase.rpc('complaint_restore_email',{p_folder_id:folderId}))},
  async requestPermanentDeletion(folderId:string,reason:string):Promise<string>{return String(await sdkGuard(supabase.rpc('complaint_request_permanent_deletion',{p_folder_id:folderId,p_reason:reason})))},
  async decideDeletion(requestId:string,approved:boolean,note?:string):Promise<void>{await sdkVoid(supabase.rpc('complaint_decide_deletion',{p_request_id:requestId,p_approved:approved,p_note:note?.trim()||null}));if(approved)await sdkGuard(supabase.functions.invoke('complaint-permanent-delete',{body:{requestId}}))},
  async retryDeletion(requestId:string,note?:string):Promise<void>{await sdkVoid(supabase.rpc('complaint_retry_permanent_deletion',{p_request_id:requestId,p_note:note?.trim()||null}));await sdkGuard(supabase.functions.invoke('complaint-permanent-delete',{body:{requestId}}))},

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

  async reports(date?:string): Promise<ComplaintReport[]> {
    let query=supabase.from('complaint_reports').select('*').order('report_date', { ascending: false })
    if(date)query=query.eq('report_date',date)
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({ id: String(row.id), reportDate: String(row.report_date),
      sector: row.sector as ComplaintSector, title: String(row.title), status: row.status as ComplaintReport['status'],
      pptxPath: (row.pptx_path as string | null) ?? null, recipients: (row.recipients as string[]) ?? [],
      deliveryId: (row.delivery_id as string | null) ?? null, createdAt: String(row.created_at), scope:(row.report_scope as 'email'|'daily')??'daily', inboxMessageId:(row.inbox_message_id as string|null)??null }))
  },

  async archiveReport(reportId:string,reason:string):Promise<void>{
    await sdkVoid(supabase.rpc('complaint_archive_report',{p_report_id:reportId,p_reason:reason.trim()}))
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
      createdAt: String(reportData.created_at), scope:(reportData.report_scope as 'email'|'daily')??'daily', inboxMessageId:(reportData.inbox_message_id as string|null)??null }
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

  async prepareEmailReport(messageId:string,templateId?:string):Promise<string>{
    return String(await sdkGuard(supabase.rpc('complaint_prepare_email_report',{p_message_id:messageId,p_template_id:templateId??null})))
  },

  async setReportStatus(reportId: string, status: ComplaintReport['status'], reviewedPptxPath?: string): Promise<void> {
    if (status !== 'approved') throw new SDKError('انتقال حالة التقرير غير مسموح', 'REPORT_TRANSITION_INVALID')
    if (!reviewedPptxPath) throw new SDKError('يجب تحديد ملف PowerPoint الذي تمت مراجعته', 'REPORT_REVIEW_REQUIRED')
    await sdkVoid(supabase.rpc('complaint_approve_report', {
      p_report_id: reportId,
      p_reviewed_pptx_path: reviewedPptxPath,
      p_review_confirmed: true,
    }))
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
