/** اختبارات SDK دورة الشكاوى — تغطية كل عملية عبر موك Supabase (بلا شبكة). */
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

type MockFn = ReturnType<typeof vi.fn>
interface MockBucket { createSignedUrl: MockFn; upload: MockFn; remove: MockFn }
interface Chain { select: MockFn; eq: MockFn; is: MockFn; in: MockFn; order: MockFn; limit: MockFn
  single: MockFn; maybeSingle: MockFn; insert: MockFn; update: MockFn; upsert: MockFn; delete: MockFn; returns: MockFn }

const h = vi.hoisted(() => {
  type Result = { data: unknown; error: { message: string; code?: string } | null }
  const state = { db: { data: [] as unknown, error: null } as Result, invoke: { data: {} as unknown, error: null } as Result }
  const tableResults = new Map<string, Result>()
  function makeChain(result: Result) {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete', 'returns']) {
      chain[method] = vi.fn(() => chain)
    }
    chain.then = (resolve: (r: Result) => void) => resolve(result)
    return chain as unknown as Record<string, ReturnType<typeof vi.fn>>
  }
  return {
    state, tableResults,
    storage: {
      from: vi.fn((): MockBucket => ({
        createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null })),
        upload: vi.fn(async () => ({ data: { path: 'uploaded-path' }, error: null })),
        remove: vi.fn(async () => ({ data: [], error: null })),
      })),
    },
    from: vi.fn((table: string) => makeChain(tableResults.get(table) ?? state.db)),
    rpc: vi.fn(async () => state.db),
    invoke: vi.fn(async () => state.invoke),
    getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
  }
})

vi.mock('@sdk/client', async (importOriginal) => {
  const actual = (await importOriginal()) as { supabase: unknown }
  return {
    ...actual,
    supabase: {
      auth: { getUser: h.getUser },
      from: h.from,
      rpc: h.rpc,
      functions: { invoke: h.invoke },
      storage: h.storage,
    },
  }
})

import { complaints } from '@sdk/complaints.sdk'
import { SDKError } from '@lib/errors/SDKError'
import type { ComplaintReportDetail } from '@features/complaints/types'

function makeFile(name: string, type: string): File {
  const raw = new TextEncoder().encode('test-bytes')
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  const file = new File([ab], name, { type })
  // jsdom لا يوفر Blob.arrayBuffer — نعرّفه يدوياً بنفس المحتوى
  Object.defineProperty(file, 'arrayBuffer', { value: async () => ab })
  return file
}

function lastBucket(): MockBucket {
  const bucket = h.storage.from.mock.results.at(-1)?.value as MockBucket | undefined
  if (!bucket) throw new Error('لم يُفتح مخزن بعد')
  return bucket
}

function lastChain(): Chain {
  const entry = h.from.mock.results.at(-1)
  if (!entry) throw new Error('لم يُستدعِ from بعد')
  return entry.value as unknown as Chain
}

beforeEach(() => {
  h.state.db = { data: [], error: null }
  h.state.invoke = { data: {}, error: null }
  h.tableResults.clear()
  h.from.mockClear()
  h.rpc.mockClear()
  h.invoke.mockClear()
  h.getUser.mockClear()
  h.storage.from.mockClear()
})

describe('SDK الشكاوى — البريد الوارد والمرفقات', () => {
  it('يجلب صندوق الوارد مع فلترة القاطع والترتيب التنازلي', async () => {
    h.state.db = { data: [{
      id: 'm1', sender_email: 'foxgn6555@gmail.com', sender_name: null, reply_to: null,
      subject: 'شكوى نفايات', source_sector: 'karrada', received_at: '2026-09-03T08:00:00Z',
      import_status: 'ready', attachment_count: 2, duplicate_of: null,
    }], error: null }
    const rows = await complaints.inbox('karrada')
    expect(h.from).toHaveBeenLastCalledWith('complaint_inbox_messages')
    expect(lastChain().order).toHaveBeenCalledWith('received_at', { ascending: false })
    expect(lastChain().eq).toHaveBeenCalledWith('source_sector', 'karrada')
    expect(rows).toEqual([expect.objectContaining({ id: 'm1', sector: 'karrada', status: 'ready', attachmentCount: 2 })])
  })

  it('يجلب مرفقات رسالة بأكوادها ويكشف التكرار عالمياً عبر RPC', async () => {
    h.state.db = { data: [
      { id: 'f1', mediaCode: 'IMG-001', name: 'a.jpg', mimeType: 'image/jpeg', storagePath: 'inbox/m1/a.jpg', duplicateCount: 2, itemId: null },
      { id: 'f2', mediaCode: 'IMG-002', name: 'b.jpg', mimeType: 'image/jpeg', storagePath: 'inbox/m1/b.jpg', duplicateCount: 0, itemId: 'i2' },
    ], error: null }
    const files = await complaints.inboxMedia('m1')
    expect(h.rpc).toHaveBeenCalledWith('complaint_inbox_media_detail', { p_message_id: 'm1' })
    expect(files[0]).toMatchObject({ mediaCode: 'IMG-001', duplicate: true, duplicateCount: 2, itemId: null })
    expect(files[1]).toMatchObject({ mediaCode: 'IMG-002', duplicate: false, itemId: 'i2' })
    expect(files[0]?.url).toContain('https://signed.test/inbox/m1/a.jpg')
  })

  it('يرفض صفحة PDF غير صورة قبل أي رفع', async () => {
    await expect(complaints.addInboxPdfPages('m1', 'f1', [makeFile('p.txt', 'text/plain')]))
      .rejects.toMatchObject({ code: 'INVALID_PDF_PAGE' })
    expect(h.storage.from).not.toHaveBeenCalled()
  })

  it('يرفع صفحات PDF ويسجلها كمرفقات بريد ويتراجع عند فشل الإدراج', async () => {
    h.tableResults.set('complaint_media', { data: null, error: null })
    const png = makeFile('page-1.png', 'image/png')
    await complaints.addInboxPdfPages('m1', 'src1', [png])
    const bucket = lastBucket()
    expect(h.storage.from).toHaveBeenCalledWith('complaint-media')
    expect(bucket.upload).toHaveBeenCalledTimes(1)
    const [path, file, opts] = bucket.upload.mock.calls[0] as [string, File, { contentType: string }]
    expect(path).toMatch(/^inbox\/m1\/pdf-src1-1-[0-9a-f-]+\.png$/)
    expect(file).toBe(png)
    expect(opts).toEqual({ contentType: 'image/png' })
    const insertArgs = lastChain().insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertArgs).toMatchObject({ inbox_message_id: 'm1', media_kind: 'email_attachment', source: 'email', pdf_page: 1, mime_type: 'image/png', uploaded_by: 'user-1' })
    expect(insertArgs.sha256).toMatch(/^[0-9a-f]{64}$/)

    h.tableResults.set('complaint_media', { data: null, error: null })
    h.storage.from.mockImplementationOnce((): MockBucket => ({
      createSignedUrl: vi.fn(), remove: vi.fn(), upload: vi.fn(async () => {
        h.tableResults.set('complaint_media', { data: null, error: { message: 'rls denied' } })
        return { data: { path: 'uploaded-path' }, error: null }
      }),
    }))
    await expect(complaints.addInboxPdfPages('m2', 'src1', [png])).rejects.toBeInstanceOf(SDKError)
    const rollback = lastBucket()
    expect(rollback.remove).toHaveBeenCalledWith([expect.stringMatching(/^inbox\/m2\//)])
  })

  it('يرفع صفحة PDF بصيغة JPEG ويحفظ رقم الصفحة الحقيقي عند الرفع التدفقي', async () => {
    h.tableResults.set('complaint_media', { data: null, error: null })
    const jpeg = makeFile('page-17.jpg', 'image/jpeg')
    await complaints.addInboxPdfPages('m1', 'src1', [jpeg], 17)
    const [path, , opts] = lastBucket().upload.mock.calls[0] as [string, File, { contentType: string }]
    expect(path).toMatch(/^inbox\/m1\/pdf-src1-17-[0-9a-f-]+\.jpg$/)
    expect(opts.contentType).toBe('image/jpeg')
    const insertArgs = lastChain().insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertArgs).toMatchObject({ pdf_page: 17, mime_type: 'image/jpeg' })
  })

  it('لا يكرر صفحة PDF المحولة سابقاً ذات المسار والبصمة نفسيهما', async () => {
    h.tableResults.set('complaint_media', { data: { id: 'existing-page' }, error: null })
    await complaints.addInboxPdfPages('m1', 'src1', [makeFile('page-1.jpg', 'image/jpeg')])
    expect(h.storage.from).not.toHaveBeenCalled()
    expect(lastChain().eq).toHaveBeenCalledWith('storage_path', expect.stringMatching(/^inbox\/m1\/pdf-src1-1-[0-9a-f]{64}\.jpg$/))
  })

  it('ينشئ موقعاً من البريد عبر RPC مع تحويل الحقول إلى snake_case', async () => {
    h.state.db = { data: 'item-9', error: null }
    const id = await complaints.createItemFromInbox('m1', ['f1', 'f2'], { neighborhood: '901', alley: '12', ocrText: 'نص' })
    expect(id).toBe('item-9')
    expect(h.rpc).toHaveBeenCalledWith('complaint_create_item_from_inbox', {
      p_message_id: 'm1', p_media_ids: ['f1', 'f2'],
      p_fields: { title: null, municipal_center: null, neighborhood: '901', alley: '12', location_text: null, ocr_text: 'نص' },
    })
  })

  it('يرسل فرز الصور كدفعة مستقلة ويحوّل نتيجة التقدم', async () => {
    h.state.db = { data: { complaintId: 'c1', itemIds: ['i1','i2'], createdCount: 2, remainingCount: 58 }, error: null }
    const result = await complaints.batchCreateItemsFromInbox('m1', [
      { mediaId: 'f1', neighborhood: '901', alley: '1' },
      { mediaId: 'f2', neighborhood: '902', alley: '2', municipalCenter: 'الكرادة' },
    ])
    expect(h.rpc).toHaveBeenCalledWith('complaint_batch_create_items_from_inbox', {
      p_message_id: 'm1', p_entries: [
        { mediaId:'f1',title:null,municipalCenter:null,neighborhood:'901',alley:'1',locationText:null,ocrText:null },
        { mediaId:'f2',title:null,municipalCenter:'الكرادة',neighborhood:'902',alley:'2',locationText:null,ocrText:null },
      ],
    })
    expect(result).toEqual({ complaintId:'c1',itemIds:['i1','i2'],createdCount:2,remainingCount:58 })
  })
})

describe('SDK الشكاوى — قائمة المواقع والإسناد والمعالجة', () => {
  const itemRowData = {
    id: 'i1', complaint_id: 'c1', sequence_no: 1, title: null, municipal_center: null, neighborhood: '901',
    alley: '12', location_text: null, ocr_text: null, assigned_to: null, status: 'ready',
    manager_notes: null, reviewer_notes: null,
    complaints: { reference_no: 'CMP-2026-1', sector: 'karrada', received_at: '2026-09-03T08:00:00Z', status: 'new' },
  }

  it('يجلب المواقع مع ربط بيانات الشكوى الأم', async () => {
    h.state.db = { data: [itemRowData], error: null }
    const items = await complaints.items(false)
    expect(h.from).toHaveBeenLastCalledWith('complaint_items')
    expect(h.getUser).not.toHaveBeenCalled()
    expect(items[0]).toMatchObject({ id: 'i1', referenceNo: 'CMP-2026-1', sector: 'karrada', status: 'ready' })
  })

  it('يقيّد قائمة «مشاريعي» بالمستخدم الحالي دون تجاوز RLS', async () => {
    await complaints.items(true)
    expect(h.getUser).toHaveBeenCalledTimes(1)
    expect(lastChain().eq).toHaveBeenCalledWith('assigned_to', 'user-1')
  })

  it('يستدعي RPC الصحيح للإسناد وبدء المعالجة والإكمال والتدقيق', async () => {
    await complaints.assign('i1', 'mgr-1')
    expect(h.rpc).toHaveBeenCalledWith('complaint_assign_item', { p_item_id: 'i1', p_manager_id: 'mgr-1' })
    h.state.db = { data: 15, error: null }
    await expect(complaints.assignBatch(['i1','i2'], 'mgr-1')).resolves.toBe(15)
    expect(h.rpc).toHaveBeenLastCalledWith('complaint_assign_items', { p_item_ids:['i1','i2'], p_manager_id:'mgr-1' })
    await complaints.start('i1')
    expect(h.rpc).toHaveBeenCalledWith('complaint_start_item', { p_item_id: 'i1' })
    await complaints.complete('i1', 'تمت المعالجة')
    expect(h.rpc).toHaveBeenCalledWith('complaint_complete_item', { p_item_id: 'i1', p_notes: 'تمت المعالجة' })
    await complaints.reviewItem('i1', true)
    expect(h.rpc).toHaveBeenCalledWith('complaint_review_item', { p_item_id: 'i1', p_approved: true, p_note: null })
    await complaints.reviewItem('i1', false, 'صورة بعد غير مطابقة')
    expect(h.rpc).toHaveBeenLastCalledWith('complaint_review_item', { p_item_id: 'i1', p_approved: false, p_note: 'صورة بعد غير مطابقة' })
  })

  it('يبدأ تذكرة البريد كاملة ويرفع ربطاً واحداً لواحد ثم يكملها ذرياً',async()=>{
    h.state.db={data:2,error:null};await expect(complaints.startAssignmentTicket('c1')).resolves.toBe(2);expect(h.rpc).toHaveBeenCalledWith('complaint_start_assignment_ticket',{p_complaint_id:'c1'})
    const first=makeFile('one.jpg','image/jpeg');const second=makeFile('two.png','image/png');h.state.db={data:2,error:null};await expect(complaints.completeAssignmentTicket('c1',[{itemId:'i1',file:first,source:'camera'},{itemId:'i2',file:second,source:'gallery'}],'اكتملت')).resolves.toBe(2)
    expect(h.rpc).toHaveBeenLastCalledWith('complaint_complete_assignment_ticket',{p_complaint_id:'c1',p_files:[expect.objectContaining({itemId:'i1',source:'camera'}),expect.objectContaining({itemId:'i2'})],p_notes:'اكتملت'})
  })

  it('يرفض تكرار ربط عنصر داخل تذكرة المعالجة قبل الرفع',async()=>{const file=makeFile('one.jpg','image/jpeg');await expect(complaints.completeAssignmentTicket('c1',[{itemId:'i1',file,source:'gallery'},{itemId:'i1',file,source:'gallery'}])).rejects.toMatchObject({code:'COMPLAINT_TICKET_FILES_COUNT_MISMATCH'});expect(h.storage.from).not.toHaveBeenCalled()})

  it('يجلب وسائط 60 عنصراً باستعلام بيانات واحد دون طلب مستقل لكل عنصر',async()=>{h.state.db={data:Array.from({length:60},(_,index)=>({id:`m${index}`,item_id:`i${index}`,media_code:`IMG-${index}`,media_kind:'before',storage_path:`p/${index}.jpg`,original_name:`${index}.jpg`,mime_type:'image/jpeg',is_active:true,display_order:1})),error:null};const rows=await complaints.itemsMedia(Array.from({length:60},(_,index)=>`i${index}`));expect(rows).toHaveLength(60);expect(h.from).toHaveBeenCalledTimes(1);expect(lastChain().in).toHaveBeenCalledWith('item_id',expect.arrayContaining(['i0','i59']));expect(h.storage.from).toHaveBeenCalledTimes(60)})

  it('يرفع التذاكر الكبيرة بتوازٍ محدود ويحافظ على ترتيب الربط',async()=>{let active=0;let maximum=0;const original=h.storage.from.getMockImplementation();const bucket:MockBucket={createSignedUrl:vi.fn(),remove:vi.fn(async()=>({data:[],error:null})),upload:vi.fn(async()=>{active+=1;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,5));active-=1;return{data:{path:'ok'},error:null}})};h.storage.from.mockImplementation(()=>bucket);try{h.state.db={data:8,error:null};const uploads=Array.from({length:8},(_,index)=>({itemId:`i${index+1}`,file:makeFile(`${index+1}.jpg`,'image/jpeg'),source:'gallery' as const}));await expect(complaints.completeAssignmentTicket('c1',uploads)).resolves.toBe(8);expect(maximum).toBe(4);expect(bucket.upload).toHaveBeenCalledTimes(8);expect(h.rpc).toHaveBeenCalledWith('complaint_complete_assignment_ticket',expect.objectContaining({p_files:expect.arrayContaining([expect.objectContaining({itemId:'i1'}),expect.objectContaining({itemId:'i8'})])}))}finally{h.storage.from.mockImplementation(original!)}})

  it('يرفع صور بعد مرتبة ويسجلها ذرياً مع الإحداثيات والمصدر', async () => {
    const first = makeFile('camera.jpg', 'image/jpeg')
    const second = makeFile('gallery.png', 'image/png')
    await complaints.uploadAfterBatch('i1', [{ file: first, source: 'camera' }, { file: second, source: 'gallery' }], { latitude: 33.31, longitude: 44.36 })
    expect(h.storage.from).toHaveBeenCalledWith('complaint-media')
    expect(h.rpc).toHaveBeenCalledWith('complaint_register_after_media', {
      p_item_id: 'i1',
      p_files: [
        expect.objectContaining({ originalName: 'camera.jpg', source: 'camera', displayOrder: 1, latitude: 33.31, longitude: 44.36 }),
        expect.objectContaining({ originalName: 'gallery.png', source: 'gallery', displayOrder: 2, latitude: 33.31, longitude: 44.36 }),
      ],
    })
    const firstBucket = h.storage.from.mock.results[0]?.value as MockBucket
    expect(firstBucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^item\/i1\/after\/[0-9a-f-]+\.jpg$/), first, { contentType: 'image/jpeg' })
  })

  it('يرفض الإحداثيات غير الصالحة قبل رفع صور المعالجة', async () => {
    const file = makeFile('a.jpg', 'image/jpeg')
    await expect(complaints.uploadAfterBatch('i1', [{ file, source: 'camera' }], { latitude: 91, longitude: 44 }))
      .rejects.toMatchObject({ code: 'COMPLAINT_AFTER_LOCATION_INVALID' })
    expect(h.storage.from).not.toHaveBeenCalled()
  })

  it('ينظف كل صور المعالجة من المخزن إذا فشل التسجيل الذري', async () => {
    h.state.db = { data: null, error: { message: 'forbidden' } }
    const files = [makeFile('a.jpg', 'image/jpeg'), makeFile('b.jpg', 'image/jpeg')]
    await expect(complaints.uploadAfterBatch('i1', files.map(file => ({ file, source: 'gallery' as const })))).rejects.toBeInstanceOf(SDKError)
    const cleanupBucket = h.storage.from.mock.results.at(-1)?.value as MockBucket
    expect(cleanupBucket.remove).toHaveBeenCalledWith([
      expect.stringMatching(/^item\/i1\/after\//), expect.stringMatching(/^item\/i1\/after\//),
    ])
  })

  it('يجلب وسائط موقع مع توقيع روابط الصور', async () => {
    h.state.db = { data: [
      { id: 'md1', media_kind: 'before', storage_path: 'inbox/m1/a.jpg', original_name: 'a.jpg', mime_type: 'image/jpeg', captured_at: null },
      { id: 'md2', media_kind: 'after', storage_path: 'item/i1/after/x.jpg', original_name: 'x.jpg', mime_type: 'image/jpeg', captured_at: '2026-09-03T10:00:00Z' },
    ], error: null }
    const media = await complaints.itemMedia('i1')
    expect(media).toHaveLength(2)
    expect(media[0]).toMatchObject({ kind: 'before', url: 'https://signed.test/inbox/m1/a.jpg' })
    expect(media[1]?.capturedAt).toBe('2026-09-03T10:00:00Z')
  })

  it('يجمع تفاصيل الموقع: وسائط وسجل الحالات والرسالة الأصلية', async () => {
    h.tableResults.set('complaint_items', { data: itemRowData, error: null })
    h.tableResults.set('complaint_media', { data: [
      { id: 'md1', media_kind: 'before', storage_path: 'inbox/m1/a.jpg', original_name: 'a.jpg', mime_type: 'image/jpeg', captured_at: null },
    ], error: null })
    h.tableResults.set('complaint_status_history', { data: [
      { id: 'h1', from_status: null, to_status: 'ready', note: null, actor_id: null, created_at: '2026-09-03T08:05:00Z' },
    ], error: null })
    h.tableResults.set('complaints', { data: {
      sender_email: 'foxgn6555@gmail.com', inbox_message_id: 'm1',
      complaint_inbox_messages: { subject: 'شكوى نفايات', body_text: 'المحلة 901' },
    }, error: null })
    const detail = await complaints.itemDetail('i1')
    expect(detail.subject).toBe('شكوى نفايات')
    expect(detail.senderEmail).toBe('foxgn6555@gmail.com')
    expect(detail.media).toHaveLength(1)
    expect(detail.history[0]).toMatchObject({ toStatus: 'ready' })
  })

  it('يرفض تفاصيل الموقع عند فقدان الشكوى الأصلية', async () => {
    h.tableResults.set('complaint_items', { data: itemRowData, error: null })
    h.tableResults.set('complaint_media', { data: [], error: null })
    h.tableResults.set('complaint_status_history', { data: [], error: null })
    h.tableResults.set('complaints', { data: null, error: null })
    await expect(complaints.itemDetail('i1')).rejects.toBeInstanceOf(SDKError)
  })

  it('يعدّل بيانات الموقع دون أي حذف', async () => {
    await complaints.updateItem('i1', { neighborhood: '902', alley: '5' })
    const updateArgs = lastChain().update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).toMatchObject({ neighborhood: '902', alley: '5' })
    expect(lastChain().eq).toHaveBeenCalledWith('id', 'i1')
    expect(lastChain().delete).not.toHaveBeenCalled()
  })

  it('يحفظ تصحيح الموقع بسبب عبر RPC التدقيق',async()=>{
    await complaints.updateItemDuringReview('i1',{neighborhood:'903',alley:'7',municipalCenter:'مركز'},'تصحيح من الكتاب')
    expect(h.rpc).toHaveBeenCalledWith('complaint_update_item_during_review',{
      p_item_id:'i1',p_neighborhood:'903',p_alley:'7',p_municipal_center:'مركز',p_location_text:null,p_reason:'تصحيح من الكتاب',
    })
  })

  it('يرفع بديل الصورة ثم يسجل الاستبدال، وينظف الملف إذا فشل RPC',async()=>{
    h.state.db={data:'new-media',error:null};const file=makeFile('corrected.jpg','image/jpeg')
    await expect(complaints.replaceItemMedia('i1','old-media','before',file,'الصورة أوضح')).resolves.toBe('new-media')
    expect(h.rpc).toHaveBeenCalledWith('complaint_replace_item_media',expect.objectContaining({p_item_id:'i1',p_old_media_id:'old-media',p_mime_type:'image/jpeg',p_reason:'الصورة أوضح'}))
    const path=(lastBucket().upload.mock.calls[0] as [string])[0];expect(path).toMatch(/^item\/i1\/review-before\//)
    h.state.db={data:null,error:{message:'locked'}}
    await expect(complaints.replaceItemMedia('i1','old-media','before',file,'محاولة ثانية')).rejects.toBeInstanceOf(SDKError)
    expect(lastBucket().remove).toHaveBeenCalledWith([expect.stringMatching(/^item\/i1\/review-before\//)])
  })
})

describe('SDK الشكاوى — القوالب وجهات الاتصال والإعدادات', () => {
  it('يجلب القوالب ويحوّلها إلى camelCase', async () => {
    h.state.db = { data: [{
      id: 't1', name: 'افتراضي', description: null, sector: null, layout: { accent: '#cf63c6' },
      is_default: true, is_active: true, version: 2,
    }], error: null }
    const templates = await complaints.templates()
    expect(templates[0]).toMatchObject({ id: 't1', isDefault: true, version: 2, layout: { accent: '#cf63c6' } })
  })

  it('يحدّث قالباً موجوداً وينشئ جديداً عند غياب المعرّف', async () => {
    await complaints.saveTemplate({ name: 'معدّل', description: null, sector: 'karrada', layout: {}, isDefault: false, isActive: true, id: 't1' })
    expect(lastChain().update).toHaveBeenCalled()
    expect(lastChain().eq).toHaveBeenCalledWith('id', 't1')
    await complaints.saveTemplate({ name: 'جديد', description: null, sector: null, layout: {}, isDefault: false, isActive: true })
    expect(lastChain().insert).toHaveBeenCalled()
  })

  it('يسجل جهة اتصال مع تحويل is_active', async () => {
    await complaints.saveContact({ sector: 'karrada', name: 'م. علي', email: 'ali@test.iq', kind: 'recipient', isActive: true })
    const insertArgs = lastChain().insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertArgs).toMatchObject({ name: 'م. علي', kind: 'recipient', is_active: true })
  })

  it('يستخدم upsert بمفتاح التعارض key للإعدادات', async () => {
    await complaints.saveSetting({ key: 'reports.cc', value: { email: 'cc@test.iq' }, description: null })
    expect(lastChain().upsert).toHaveBeenCalledWith(
      { key: 'reports.cc', value: { email: 'cc@test.iq' }, description: null },
      { onConflict: 'key' })
  })

  it('يجلب ملخص لوحة التحكم من RPC', async () => {
    h.state.db = { data: { total: 4, newCount: 1 }, error: null }
    const summary = await complaints.summary()
    expect(h.rpc).toHaveBeenCalledWith('complaint_dashboard_summary')
    expect(summary).toMatchObject({ total: 4 })
  })

  it('يجلب تحليلات الفترة والقاطع عبر SDK',async()=>{
    h.state.db={data:{from:'2026-09-01',to:'2026-09-05',summary:{total:60},daily:[],statuses:[],sectors:[]},error:null}
    const result=await complaints.analytics('2026-09-01','2026-09-05','karrada')
    expect(h.rpc).toHaveBeenCalledWith('complaint_analytics',{p_from:'2026-09-01',p_to:'2026-09-05',p_sector:'karrada'})
    expect(result.summary.total).toBe(60)
  })
})

describe('SDK الشكاوى — الحذف النهائي القابل للاسترداد', () => {
  it('يعيد محاولة الطلب الفاشل عبر RPC ثم يشغّل المنفذ الآمن', async () => {
    await complaints.retryDeletion('delete-1', 'إعادة محاولة موقعة')
    expect(h.rpc).toHaveBeenCalledWith('complaint_retry_permanent_deletion', {
      p_request_id: 'delete-1', p_note: 'إعادة محاولة موقعة',
    })
    expect(h.invoke).toHaveBeenCalledWith('complaint-permanent-delete', { body: { requestId: 'delete-1' } })
  })

  it('يشغّل المنفذ بعد الموافقة ولا يشغّله عند الرفض', async () => {
    await complaints.decideDeletion('delete-1', false, 'مرفوض')
    expect(h.invoke).not.toHaveBeenCalled()
    await complaints.decideDeletion('delete-2', true, 'موافقة')
    expect(h.invoke).toHaveBeenCalledWith('complaint-permanent-delete', { body: { requestId: 'delete-2' } })
  })
})

describe('SDK الشكاوى — التقارير والتسليم', () => {
  const reportRow = {
    id: 'r1', report_date: '2026-09-03', sector: 'karrada', title: 'تقرير يومي', status: 'draft',
    pptx_path: null, recipients: ['foxgn6555@gmail.com'], delivery_id: null, created_at: '2026-09-03T18:00:00Z',
  }
  const linkRow = {
    item_id: 'i1', display_order: 1, included: true, slide_layout: {},
    complaint_items: {
      id: 'i1', complaint_id: 'c1', sequence_no: 1, title: null, municipal_center: null, neighborhood: '901',
      alley: '12', location_text: null, ocr_text: null, assigned_to: null, status: 'processed',
      manager_notes: null, reviewer_notes: null,
      complaints: { reference_no: 'CMP-2026-1', sector: 'karrada', received_at: '2026-09-03T08:00:00Z', status: 'new' },
    },
  }

  it('يجلب قائمة التقارير مرتبة بالتاريخ تنازلياً', async () => {
    h.state.db = { data: [reportRow], error: null }
    const reports = await complaints.reports()
    expect(lastChain().order).toHaveBeenCalledWith('report_date', { ascending: false })
    expect(reports[0]).toMatchObject({ id: 'r1', reportDate: '2026-09-03', status: 'draft' })
  })

  it('يجمع تفاصيل التقرير مع عناصره وسجل تسليمه', async () => {
    h.tableResults.set('complaint_reports', { data: reportRow, error: null })
    h.tableResults.set('complaint_report_items', { data: [linkRow], error: null })
    h.tableResults.set('complaint_email_deliveries', { data: [
      { id: 'd1', recipients: ['foxgn6555@gmail.com'], subject: 'تقرير يومي', status: 'delivered', error_message: null, created_at: '2026-09-03T19:00:00Z', delivered_at: '2026-09-03T19:01:00Z' },
    ], error: null })
    const detail = await complaints.reportDetail('r1')
    expect(h.from).toHaveBeenNthCalledWith(1, 'complaint_reports')
    expect(h.from).toHaveBeenNthCalledWith(2, 'complaint_report_items')
    expect(detail.items).toHaveLength(1)
    expect(detail.items[0]).toMatchObject({ itemId: 'i1', displayOrder: 1, included: true })
    expect(detail.items[0]?.item.referenceNo).toBe('CMP-2026-1')
    expect(detail.deliveries[0]).toMatchObject({ status: 'delivered', deliveredAt: '2026-09-03T19:01:00Z' })
  })

  it('يحفظ مسودة التقرير عبر RPC مع خريطة العناصر (بسقاط الحقول المحلية)', async () => {
    const draftItems = [{
      itemId: 'i1', displayOrder: 1, included: true, slideLayout: {},
      item: { id: 'i1', referenceNo: 'CMP-2026-1' },
    }] as unknown as ComplaintReportDetail['items']
    await complaints.saveReportDraft({
      id: 'r1', title: 'محدّث', layout: { accent: '#000' }, recipients: ['a@b.c'], items: draftItems,
    })
    expect(h.rpc).toHaveBeenCalledWith('complaint_update_report_draft', {
      p_report_id: 'r1', p_title: 'محدّث', p_layout: { accent: '#000' }, p_recipients: ['a@b.c'],
      p_items: [{ itemId: 'i1', displayOrder: 1, included: true, slideLayout: {} }],
    })
  })

  it('يعيد معرّف المسودة من RPC الإعداد اليومي', async () => {
    h.state.db = { data: 'rep-new', error: null }
    const id = await complaints.prepareReport('karrada', '2026-09-03')
    expect(h.rpc).toHaveBeenCalledWith('complaint_prepare_daily_report', { p_sector: 'karrada', p_date: '2026-09-03', p_template_id: null })
    expect(id).toBe('rep-new')
  })

  it('يدقق تذكرة البريد والمسؤول كاملة باستدعاء ذري',async()=>{h.state.db={data:3,error:null};await expect(complaints.reviewAssignmentTicket('c1','m1',false,'إعادة المعالجة')).resolves.toBe(3);expect(h.rpc).toHaveBeenCalledWith('complaint_review_assignment_ticket',{p_complaint_id:'c1',p_manager_id:'m1',p_approved:false,p_note:'إعادة المعالجة'})})

  it('ينشئ مسودة موحدة لبريد واحد عبر RPC مستقل',async()=>{h.state.db={data:'email-report-1',error:null};await expect(complaints.prepareEmailReport('message-1','template-1')).resolves.toBe('email-report-1');expect(h.rpc).toHaveBeenCalledWith('complaint_prepare_email_report',{p_message_id:'message-1',p_template_id:'template-1'})})

  it('يقبل انتقال الحالة إلى approved فقط ويرفض غيره قبل أي RPC', async () => {
    await expect(complaints.setReportStatus('r1', 'draft')).rejects.toMatchObject({ code: 'REPORT_TRANSITION_INVALID' })
    expect(h.rpc).not.toHaveBeenCalled()
    await expect(complaints.setReportStatus('r1', 'approved')).rejects.toMatchObject({ code: 'REPORT_REVIEW_REQUIRED' })
    await complaints.setReportStatus('r1', 'approved', 'reports/r1/reviewed.pptx')
    expect(h.rpc).toHaveBeenCalledWith('complaint_approve_report', {
      p_report_id: 'r1', p_reviewed_pptx_path: 'reports/r1/reviewed.pptx', p_review_confirmed: true,
    })
  })

  it('يولّد PowerPoint عبر الدالة الطرفية ويفشل برمز واضح', async () => {
    h.state.invoke = { data: { path: 'reports/r1/x.pptx' }, error: null }
    const path = await complaints.generateReport('r1')
    expect(h.invoke).toHaveBeenCalledWith('complaint-generate-report', { body: { reportId: 'r1' } })
    expect(path).toBe('reports/r1/x.pptx')
    h.state.invoke = { data: null, error: { message: 'boom' } }
    await expect(complaints.generateReport('r1')).rejects.toMatchObject({ code: 'REPORT_GENERATION_FAILED' })
  })

  it('يوفر رابط تنزيل موقّعاً للـ PPTX', async () => {
    const url = await complaints.reportDownloadUrl('reports/r1/x.pptx')
    const bucket = lastBucket()
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('reports/r1/x.pptx', 600, { download: true })
    expect(url).toContain('https://signed.test/')
  })

  it('يرسل البريد عبر mailgun-send ويعيد معرّف التسليم ويفشل برمز واضح', async () => {
    h.state.invoke = { data: { deliveryId: 'd9' }, error: null }
    const input = { reportId: 'r1', to: ['foxgn6555@gmail.com'], subject: 'تقرير', text: 'مرفق', attachmentPaths: ['reports/r1/x.pptx'] }
    const result = await complaints.sendEmail(input)
    expect(h.invoke).toHaveBeenCalledWith('mailgun-send', { body: input })
    expect(result.deliveryId).toBe('d9')
    h.state.invoke = { data: null, error: { message: 'provider down' } }
    await expect(complaints.sendEmail(input)).rejects.toMatchObject({ code: 'MAILGUN_SEND_FAILED' })
  })

  it('يجلب سجل التسليم مع فلاتر اختيارية', async () => {
    h.state.db = { data: [{
      id: 'd1', recipients: ['foxgn6555@gmail.com'], subject: 'تقرير يومي', status: 'queued',
      error_message: null, created_at: '2026-09-03T19:00:00Z', delivered_at: null,
    }], error: null }
    const rows = await complaints.deliveries('c1', 'r1')
    expect(lastChain().eq).toHaveBeenNthCalledWith(1, 'complaint_id', 'c1')
    expect(lastChain().eq).toHaveBeenNthCalledWith(2, 'report_id', 'r1')
    expect(rows[0]).toMatchObject({ status: 'queued', recipients: ['foxgn6555@gmail.com'] })
  })
})