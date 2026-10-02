/** SDK شكاوى المواطنين (00168): أسماء الدوال ومعاملاتها كما في الترحيل، رفع الصور داخل مجلد الرمز، ترجمة الأخطاء */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
  upload: vi.fn(async () => ({ data: { path: 'p' }, error: null })),
  signed: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://s/${p}` })), error: null })),
}))
vi.mock('@sdk/client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  supabase: { rpc: h.rpc, storage: { from: () => ({ upload: h.upload, createSignedUrls: h.signed }) } },
}))
import { citizen, citizenErrorMessage, CITIZEN_STATUS_LABEL } from '@sdk/citizen.sdk'

beforeEach(() => vi.clearAllMocks())

describe('citizen.sdk', () => {
  it('المواطن: الدخول والشكوى والمحادثة بالمعاملات الصحيحة (p_token أولاً)', async () => {
    await citizen.signIn('علي حسين', '0770')
    expect(h.rpc).toHaveBeenLastCalledWith('citizen_sign_in', { p_name: 'علي حسين', p_phone: '0770' })
    await citizen.submitComplaint('t', { fullName: 'علي حسين كاظم', details: 'تفاصيل الشكوى هنا', lat: 33.3, lng: 44.4, photos: ['t/1.jpg'] })
    expect(h.rpc).toHaveBeenLastCalledWith('citizen_complaint_submit', { p_token: 't', p_full_name: 'علي حسين كاظم', p_details: 'تفاصيل الشكوى هنا', p_lat: 33.3, p_lng: 44.4, p_address: null, p_photos: ['t/1.jpg'] })
    await citizen.chatState('t', 7)
    expect(h.rpc).toHaveBeenLastCalledWith('citizen_chat_state', { p_token: 't', p_after: 7 })
    await citizen.chatRate('t', 's', 5, 'ممتاز')
    expect(h.rpc).toHaveBeenLastCalledWith('citizen_chat_rate', { p_token: 't', p_session: 's', p_stars: 5, p_note: 'ممتاز' })
  })
  it('رفع الصورة يكون داخل مجلد الرمز (سياسة التخزين) وبصيغة JPEG', async () => {
    const path = await citizen.uploadPhoto('tok', new Blob(['x']), 2)
    expect(path.startsWith('tok/')).toBe(true); expect(path.endsWith('-2.jpg')).toBe(true)
    expect(h.upload).toHaveBeenCalledWith(path, expect.anything(), { contentType: 'image/jpeg', upsert: false })
    expect(await citizen.photoUrls(['a', 'b'])).toEqual({ a: 'https://s/a', b: 'https://s/b' })
    expect(await citizen.photoUrls([])).toEqual({})
  })
  it('غرفة العمليات والتقرير', async () => {
    await citizen.opsList({ status: 'new', search: ' 0770 ' })
    expect(h.rpc).toHaveBeenLastCalledWith('ops_citizen_complaints_list', { p_status: 'new', p_search: '0770', p_from: null, p_to: null, p_limit: 1000 })
    await citizen.opsAssign('c', 'u')
    expect(h.rpc).toHaveBeenLastCalledWith('ops_citizen_complaint_assign', { p_complaint: 'c', p_user: 'u', p_note: null })
    await citizen.setStatus('c', 'on_hold', 'سبب')
    expect(h.rpc).toHaveBeenLastCalledWith('citizen_complaint_set_status', { p_complaint: 'c', p_status: 'on_hold', p_note: 'سبب' })
    await citizen.report('2026-10-01', '2026-10-31')
    expect(h.rpc).toHaveBeenLastCalledWith('citizen_complaints_report', { p_from: '2026-10-01', p_to: '2026-10-31' })
  })
  it('ترجمة الأخطاء والحالات', () => {
    expect(citizenErrorMessage(new Error('CITIZEN_DAILY_LIMIT'))).toContain('5')
    expect(citizenErrorMessage(new Error('CITIZEN_CHAT_TAKEN'))).toContain('زميل')
    expect(citizenErrorMessage(new Error('weird'))).toBe('weird')
    expect(CITIZEN_STATUS_LABEL.on_hold).toBe('معلقة')
  })
})
