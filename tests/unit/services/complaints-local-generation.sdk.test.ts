/** التوليد داخل المتصفح: الملف المرفوع يطابق المعاينة ويُربط بالتقرير بدور الموظف. */
import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockFn = ReturnType<typeof vi.fn>
interface Result { data: unknown; error: { message: string } | null }

const h = vi.hoisted(() => {
  const tableResults = new Map<string, Result>()
  function makeChain(result: Result) {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'gte', 'lt', 'is', 'in', 'order', 'limit', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete', 'returns']) {
      chain[method] = vi.fn(() => chain)
    }
    chain.then = (resolve: (r: Result) => void) => resolve(result)
    return chain
  }
  return {
    tableResults,
    upload: null as unknown as MockFn,
    rpc: null as unknown as MockFn,
    fetchMock: null as unknown as MockFn,
    setTable: (table: string, data: unknown) => tableResults.set(table, { data, error: null }),
    makeChain,
  }
})

vi.mock('@sdk/client', async (importOriginal) => {
  const actual = (await importOriginal()) as { supabase: unknown }
  h.upload = vi.fn(async () => ({ data: { path: 'uploaded' }, error: null }))
  h.rpc = vi.fn(async (name: string) => name === 'complaint_list_managers'
    ? { data: [{ user_id: 'u1', full_name: 'المهندس علي', job_title: 'مسؤول قسم' }], error: null }
    : { data: null, error: null })
  return {
    ...actual,
    supabase: {
      auth: { getUser: vi.fn() },
      from: vi.fn((table: string) => h.makeChain(h.tableResults.get(table) ?? { data: [], error: null })),
      rpc: h.rpc,
      functions: { invoke: vi.fn() },
      storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null })), upload: h.upload, remove: vi.fn() })) },
    },
  }
})

const pngBytes = (width: number, height: number) => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

beforeEach(() => {
  vi.clearAllMocks()
  const png = pngBytes(16, 9)
  const buffer = png.slice().buffer
  h.fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => buffer }))
  vi.stubGlobal('fetch', h.fetchMock)

  h.setTable('complaint_reports', {
    id: 'rep-1', report_date: '2026-09-18', sector: 'karrada', title: 'التقرير اليومي الجامع للشكاوى',
    status: 'draft', pptx_path: null, recipients: ['a@b.iq'], delivery_id: null, created_at: '2026-09-18T00:00:00Z',
    report_scope: 'daily', inbox_message_id: 'msg-1', layout: { accent: '#cf63c6' },
    approved_at: null, sent_at: null, archived_at: null,
  })
  h.setTable('complaint_report_items', [{
    item_id: 'i1', display_order: 1, included: true, slide_layout: {},
    complaint_items: {
      id: 'i1', complaint_id: 'c1', sequence_no: 7, title: 'أنقاض', municipal_center: 'بلدية الكرادة',
      neighborhood: '44', alley: '44', location_text: null, ocr_text: null, assigned_to: 'u1',
      status: 'approved', manager_notes: null, reviewer_notes: null, received_at: '2026-09-18T00:00:00Z',
      complaints: { reference_no: 'ش-1', sector: 'karrada', received_at: '2026-09-18T00:00:00Z', status: 'under_review', inbox_message_id: 'msg-1', complaint_inbox_messages: { subject: 'بريد الأنقاض' } },
    },
  }])
  h.setTable('complaint_email_deliveries', [])
  h.setTable('complaint_media', [{
    id: 'm1', item_id: 'i1', media_code: 'MC-1', media_kind: 'before', storage_path: 'item/i1/before/1.png',
    original_name: 'before.png', mime_type: 'image/png', captured_at: null, is_active: true,
    replacement_reason: null, superseded_at: null, display_order: 1,
  }, {
    id: 'm2', item_id: 'i1', media_code: 'MC-2', media_kind: 'after', storage_path: 'item/i1/after/1.png',
    original_name: 'after.png', mime_type: 'image/png', captured_at: null, is_active: true,
    replacement_reason: null, superseded_at: null, display_order: 1,
  }])
  h.setTable('employees', [{ user_id: 'u1', full_name: 'المهندس علي' }])
})

import { complaints } from '@sdk/complaints.sdk'

describe('generateReportLocally', () => {
  it('يرفع ملف PowerPoint مطابقاً للمعاينة ويربطه بالتقرير', async () => {
    const path = await complaints.generateReportLocally('rep-1')
    expect(path).toMatch(/^reports\/rep-1\/complaints-karrada-2026-09-18-.*\.pptx$/)

    expect(h.upload).toHaveBeenCalledTimes(1)
    const [uploadedPath, bytes, options] = h.upload.mock.calls[0] as unknown as [string, Uint8Array, { contentType: string }]
    expect(uploadedPath).toBe(path)
    expect(options.contentType).toContain('presentationml.presentation')
    expect(bytes[0]).toBe(0x50)

    // الملف المرفوع نفسه يحمل شرائح التصميم المعتمد: غلاف وجدول وتذييل قبل/بعد
    const zip = await JSZip.loadAsync(bytes)
    const cover = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(cover).toContain('أمانة بغداد / دائرة بلدية الكرادة')
    expect(cover).toContain('قاطع الكرادة - 2026-09-18')
    const table = await zip.file('ppt/slides/slide2.xml')!.async('string')
    expect(table).toContain('جدول بيانات التلكؤات')
    expect(table).toContain('وقت وصول الشكوى')
    expect(table).toContain('التاريخ')
    const photo = await zip.file('ppt/slides/slide3.xml')!.async('string')
    expect(photo).toContain('محلة 44 - زقاق 44 - أنقاض')
    expect(photo).toContain('r:embed="rId2"')

    expect(h.rpc).toHaveBeenCalledWith('complaint_attach_pptx', { p_report_id: 'rep-1', p_path: path })
  })

  it('يرفض التوليد دون مواقع مضمنة', async () => {
    h.setTable('complaint_report_items', [])
    await expect(complaints.generateReportLocally('rep-1')).rejects.toThrow()
  })
})
