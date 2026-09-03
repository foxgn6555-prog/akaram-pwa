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

  it('يجلب مرفقات رسالة مع توقيع الروابط وكشف التكرار عبر sha256', async () => {
    h.state.db = { data: [
      { id: 'f1', original_name: 'a.jpg', mime_type: 'image/jpeg', storage_path: 'inbox/m1/a.jpg', sha256: 'aa' },
      { id: 'f2', original_name: 'b.jpg', mime_type: 'image/jpeg', storage_path: 'inbox/m1/b.jpg', sha256: 'aa' },
      { id: 'f3', original_name: 'c.jpg', mime_type: 'image/jpeg', storage_path: 'inbox/m1/c.jpg', sha256: null },
    ], error: null }
    const files = await complaints.inboxMedia('m1')
    expect(h.from).toHaveBeenLastCalledWith('complaint_media')
    expect(lastChain().eq).toHaveBeenCalledWith('inbox_message_id', 'm1')
    expect(lastChain().is).toHaveBeenCalledWith('item_id', null)
    expect(files[1]?.duplicate).toBe(true)
    expect(files[0]?.duplicate).toBe(false)
    expect(files[2]?.url).toContain('https://signed.test/inbox/m1/c.jpg')
  })

  it('يرفض صفحة PDF غير PNG قبل أي رفع', async () => {
    await expect(complaints.addInboxPdfPages('m1', 'f1', [makeFile('p.jpg', 'image/jpeg')]))
      .rejects.toMatchObject({ code: 'INVALID_PDF_PAGE' })
    expect(h.storage.from).not.toHaveBeenCalled()
  })

  it('يرفع صفحات PDF ويسجلها كمرفقات بريد ويتراجع عند فشل الإدراج', async () => {
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

    h.tableResults.set('complaint_media', { data: null, error: { message: 'rls denied' } })
    await expect(complaints.addInboxPdfPages('m2', 'src1', [png])).rejects.toBeInstanceOf(SDKError)
    const rollback = lastBucket()
    expect(rollback.remove).toHaveBeenCalledWith([expect.stringMatching(/^inbox\/m2\//)])
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
    await complaints.start('i1')
    expect(h.rpc).toHaveBeenCalledWith('complaint_start_item', { p_item_id: 'i1' })
    await complaints.complete('i1', 'تمت المعالجة')
    expect(h.rpc).toHaveBeenCalledWith('complaint_complete_item', { p_item_id: 'i1', p_notes: 'تمت المعالجة' })
    await complaints.reviewItem('i1', true)
    expect(h.rpc).toHaveBeenCalledWith('complaint_review_item', { p_item_id: 'i1', p_approved: true, p_note: null })
    await complaints.reviewItem('i1', false, 'صورة بعد غير مطابقة')
    expect(h.rpc).toHaveBeenLastCalledWith('complaint_review_item', { p_item_id: 'i1', p_approved: false, p_note: 'صورة بعد غير مطابقة' })
  })

  it('يرفع صورة بعد إلى مسار الموقع ويسجل الإحداثيات ووقت الالتقاط', async () => {
    const file = makeFile('after.jpg', 'image/jpeg')
    await complaints.uploadAfter('i1', file, { latitude: 33.31, longitude: 44.36 })
    const bucket = lastBucket()
    const [path, uploaded, opts] = bucket.upload.mock.calls[0] as [string, File, { contentType: string }]
    expect(path).toMatch(/^item\/i1\/after\/[0-9a-f-]+\.jpg$/)
    expect(uploaded).toBe(file)
    expect(opts.contentType).toBe('image/jpeg')
    const insertArgs = lastChain().insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertArgs).toMatchObject({ item_id: 'i1', media_kind: 'after', latitude: 33.31, longitude: 44.36, uploaded_by: 'user-1', source: 'gallery' })
    expect(insertArgs.captured_at).toBeTruthy()
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

  it('يقبل انتقال الحالة إلى approved فقط ويرفض غيره قبل أي RPC', async () => {
    await expect(complaints.setReportStatus('r1', 'draft')).rejects.toMatchObject({ code: 'REPORT_TRANSITION_INVALID' })
    expect(h.rpc).not.toHaveBeenCalled()
    await complaints.setReportStatus('r1', 'approved')
    expect(h.rpc).toHaveBeenCalledWith('complaint_approve_report', { p_report_id: 'r1' })
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