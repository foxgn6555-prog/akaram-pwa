/**
 * عقد وسيط SDK للإعلام: وسائط jsonb تصل كمصفوفات حقيقية (وليس نصاً مُرمَّزاً)
 * — يحرس هذا الاختبار خطأ «عدد الصور يجب أن يكون بين 1 و500» الناتج عن
 * الترميز المزدوج JSON.stringify لوسائط jsonb.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc },
  sdkGuard: async (value: Promise<{ data: unknown; error: null | { message: string } }>) => {
    const result = await value
    if (result.error) throw new Error(result.error.message)
    return result.data
  },
}))
import { mediaService } from '@sdk/media.sdk'

beforeEach(() => {
  h.rpc.mockReset()
  h.rpc.mockResolvedValue({ data: [], error: null })
})

describe('وسائط jsonb في SDK الإعلام', () => {
  it('sendPhotos يرسل p_photos مصفوفة كائنات (لا نص JSON)', async () => {
    await mediaService.sendPhotos('street', 'شارع الرشيد', null, '', [
      { storagePath: 'u/1.jpg', caption: 'أ' },
      { storagePath: 'u/2.jpg', caption: '' },
    ])
    expect(h.rpc).toHaveBeenCalledWith('media_send_photos', expect.objectContaining({
      p_mode: 'street',
      p_title: 'شارع الرشيد',
    }))
    const params = h.rpc.mock.calls[0]![1] as { p_photos: unknown }
    expect(Array.isArray(params.p_photos)).toBe(true)
    expect(typeof params.p_photos).toBe('object')
    expect(params.p_photos).toEqual([
      { storage_path: 'u/1.jpg', caption: 'أ' },
      { storage_path: 'u/2.jpg', caption: '' },
    ])
  })

  it('createDesign يرسل p_photos مصفوفة بمعرفات الصور', async () => {
    await mediaService.createDesign('karrada', 'first_half', 'تصميم', null, [
      { photoId: 'p1', workType: 'كنس الشوارع', caption: 'م' },
    ])
    const params = h.rpc.mock.calls[0]![1] as { p_photos: unknown; p_sector_parent: string }
    expect(params.p_sector_parent).toBe('karrada')
    expect(Array.isArray(params.p_photos)).toBe(true)
    expect(params.p_photos).toEqual([
      { photo_id: 'p1', work_type: 'كنس الشوارع', caption: 'م' },
    ])
  })

  it('addDesignPhotos يرسل p_photos مصفوفة', async () => {
    await mediaService.addDesignPhotos('d1', [
      { photoId: 'p9', workType: 'غسل الشارع', caption: '' },
    ])
    const params = h.rpc.mock.calls[0]![1] as { p_id: string; p_photos: unknown }
    expect(params.p_id).toBe('d1')
    expect(Array.isArray(params.p_photos)).toBe(true)
  })

  it('saveDesignReport يرسل الورقات والعبارات مصفوفات jsonb', async () => {
    await mediaService.saveDesignReport(
      'd9',
      [{ workType: 'كنس الشوارع', text: 'أعمال كنس الشوارع' }],
      [{ rowId: 'r1', text: 'كنس شارع المستنك' }],
    )
    expect(h.rpc).toHaveBeenCalledWith('media_design_report_save', {
      p_id: 'd9',
      p_sheets: [{ work_type: 'كنس الشوارع', text: 'أعمال كنس الشوارع' }],
      p_captions: [{ row_id: 'r1', text: 'كنس شارع المستنك', fit: null, zoom: null }],
      p_summary: null,
      p_colors: null,
      p_style: null,
    })
  })

  it('reorderDesignPhotos يرسل العناصر بمصفوفة jsonb', async () => {
    await mediaService.reorderDesignPhotos('d9', [
      { rowId: 'r2', workType: 'غسل المدارس', sortOrder: 1 },
    ])
    expect(h.rpc).toHaveBeenCalledWith('media_design_photos_reorder', {
      p_id: 'd9',
      p_items: [{ row_id: 'r2', work_type: 'غسل المدارس', sort_order: 1 }],
    })
  })

  it('القوالب: تمرير الوسائط بأسمائها الصحيحة', async () => {
    h.rpc.mockResolvedValue({ data: { id: 't1' }, error: null })
    await mediaService.createTemplate({
      title: 'قالب',
      sectorParent: null,
      periodType: 'monthly',
      coverPath: null,
      workTypes: ['كنس الشوارع'],
      notes: '',
    })
    expect(h.rpc).toHaveBeenCalledWith('media_template_create', {
      p_title: 'قالب',
      p_sector_parent: null,
      p_period_type: 'monthly',
      p_cover_path: null,
      p_work_types: ['كنس الشوارع'],
      p_notes: '',
    })
  })
})
