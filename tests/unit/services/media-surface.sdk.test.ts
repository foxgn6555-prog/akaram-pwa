/** عقود الإعلام: التذاكر، التخزين، تفاصيل التصميم، الغلافات والقوالب. كل الخوادم بديلة ومحلية. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { result: { data: [] as unknown, error: null as null | { message: string } } }
  const bucket = {
    upload: vi.fn(async (..._args: unknown[]): Promise<{ data: { path: string } | null; error: null | { message: string } }> => ({ data: { path: 'p' }, error: null })),
    createSignedUrls: vi.fn(async (..._args: unknown[]) => state.result),
  }
  // قراءة ترويسة التصميم مباشرة من الجدول (from().select().eq().maybeSingle()) — مسار «تصميم بلا صور» فقط
  const header = { result: { data: null as unknown, error: null as null | { message: string } } }
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => header.result) }
  chain.select.mockImplementation(() => chain); chain.eq.mockImplementation(() => chain)
  return { state, header, chain, from: vi.fn(() => chain), bucket, rpc: vi.fn(async (..._args: unknown[]) => state.result), storageFrom: vi.fn(() => bucket), getUser: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: { id: 'media-user' } } })) }
})
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc, from: h.from, storage: { from: h.storageFrom }, auth: { getUser: h.getUser } },
  sdkGuard: async (value: PromiseLike<{ data: unknown; error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data },
  sdkVoid: async (value: PromiseLike<{ error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message) },
  sdkMaybe: async (value: PromiseLike<{ data: unknown; error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data },
}))
import { mediaService } from '@sdk/media.sdk'

const args = () => h.rpc.mock.lastCall?.[1]
beforeEach(() => {
  h.state.result = { data: [], error: null }
  h.rpc.mockReset(); h.rpc.mockImplementation(async () => h.state.result)
  h.header.result = { data: null, error: null }; h.from.mockClear(); h.chain.select.mockClear(); h.chain.eq.mockClear(); h.chain.maybeSingle.mockClear()
  h.storageFrom.mockClear(); h.getUser.mockClear(); h.bucket.upload.mockClear(); h.bucket.createSignedUrls.mockClear()
  h.getUser.mockResolvedValue({ data: { user: { id: 'media-user' } } })
  h.bucket.upload.mockResolvedValue({ data: { path: 'p' }, error: null })
})

describe('media — التذاكر وتقرير الحملات', () => {
  it('الإرسال والدمج والتعديل والأرشفة يحفظ التفاصيل ويحول الحقول الاختيارية الفارغة إلى null', async () => {
    h.state.result = { data: { id: 's1' }, error: null }
    expect(await mediaService.sendPhotos('campaign', 'حملة', '', '', [{ storagePath: 'u/p.jpg', caption: 'صورة' }])).toEqual({ id: 's1' })
    expect(h.rpc).toHaveBeenLastCalledWith('media_send_photos', { p_mode: 'campaign', p_title: 'حملة', p_work_type: null, p_notes: null, p_photos: [{ storage_path: 'u/p.jpg', caption: 'صورة' }], p_details: {} })
    const details = { location: 'الوليد', exec_date: '2026-11-01', supervisors: 0, workers: 4, vehicles: { tipper: 2, tanker: 0 } }
    await mediaService.sendPhotos('campaign', 'حملة', 'كنس', 'ملاحظة', [], details)
    expect(args()).toMatchObject({ p_work_type: 'كنس', p_notes: 'ملاحظة', p_details: details })
    await mediaService.mergeSubmissions(['s1', 's2'], 'موحد', '', '')
    expect(h.rpc).toHaveBeenLastCalledWith('media_submissions_merge', { p_ids: ['s1', 's2'], p_title: 'موحد', p_work_type: null, p_notes: null })
    await mediaService.mergeSubmissions(['s1'], 'بعنوان', 'غسل', 'ملاحظة')
    expect(args()).toMatchObject({ p_work_type: 'غسل', p_notes: 'ملاحظة' })
    await mediaService.updateSubmission('s1', { title: 'عنوان', workType: '', eventDate: '', notes: '' })
    expect(h.rpc).toHaveBeenLastCalledWith('media_submission_update', { p_id: 's1', p_title: 'عنوان', p_work_type: null, p_event_date: null, p_notes: null })
    await mediaService.updateSubmission('s1', { title: 'عنوان', workType: 'كنس', eventDate: '2026-11-01', notes: 'م' })
    expect(args()).toMatchObject({ p_work_type: 'كنس', p_event_date: '2026-11-01', p_notes: 'م' })
    await mediaService.updatePhotoCaption('p1', 'وصف')
    expect(h.rpc).toHaveBeenLastCalledWith('media_photo_update', { p_photo_id: 'p1', p_caption: 'وصف' })
    await mediaService.archiveSubmission('s1', '')
    expect(h.rpc).toHaveBeenLastCalledWith('media_submission_archive', { p_id: 's1', p_reason: null })
    await mediaService.archiveSubmission('s1', 'مكرر')
    expect(h.rpc).toHaveBeenLastCalledWith('media_submission_archive', { p_id: 's1', p_reason: 'مكرر' })
  })
  it('القوائم افتراضياً بلا فلاتر، والفلاتر الصريحة تصل كما هي؛ null تصبح قائمة فارغة', async () => {
    expect(await mediaService.mySubmissions()).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('media_my_submissions', { p_from: null, p_to: null, p_mode: null })
    await mediaService.mySubmissions('2026-11-01', '2026-11-30', 'campaign')
    expect(args()).toEqual({ p_from: '2026-11-01', p_to: '2026-11-30', p_mode: 'campaign' })
    await mediaService.opsCampaignsReport({})
    expect(h.rpc).toHaveBeenLastCalledWith('ops_campaigns_report', { p_mode: null, p_sector_parent: null, p_sector_id: null, p_from: null, p_to: null })
    await mediaService.opsCampaignsReport({ mode: 'campaign', sectorParent: 'karrada', sectorId: 0, from: 'a', to: 'b' })
    expect(args()).toEqual({ p_mode: 'campaign', p_sector_parent: 'karrada', p_sector_id: 0, p_from: 'a', p_to: 'b' })
    await mediaService.listSubmissions()
    expect(h.rpc).toHaveBeenLastCalledWith('media_submissions_list', { p_sector_parent: null, p_status: 'active', p_work_type: null })
    await mediaService.listSubmissions('karrada', 'archived', 'كنس')
    expect(args()).toEqual({ p_sector_parent: 'karrada', p_status: 'archived', p_work_type: 'كنس' })
    expect(await mediaService.submissionPhotos('s1')).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('media_submission_photos_list', { p_submission_id: 's1' })
    h.state.result = { data: null, error: { message: 'MEDIA_DENIED' } }
    await expect(mediaService.listSubmissions()).rejects.toThrow('MEDIA_DENIED')
    await expect(mediaService.mySubmissions()).rejects.toThrow('MEDIA_DENIED')
  })
})

describe('media — رفع الصور والروابط المؤقتة', () => {
  it('دفعة أكبر من الستة تحفظ ترتيب الملفات، تنظف الاسم، ولا تستخدم upsert', async () => {
    const files = Array.from({ length: 8 }, (_, i) => new File(['x'], i === 0 ? 'صورة الشارع.jpg' : `photo-${i + 1}.png`, { type: i === 1 ? '' : 'image/png' }))
    const paths = await mediaService.uploadPhotos(files)
    expect(paths).toHaveLength(8)
    expect(h.bucket.upload).toHaveBeenCalledTimes(8)
    expect(h.storageFrom).toHaveBeenCalledWith('media-photos')
    const calls = h.bucket.upload.mock.calls as unknown as Array<[string, File, { contentType: string; upsert: boolean }]>
    calls.forEach(([path, file, options], i) => {
      expect(path).toMatch(/^media-user\/\d+-/)
      expect(path).toBe(paths[i])
      expect(file).toBe(files[i])
      expect(options.upsert).toBe(false)
      expect(options.contentType).toBe(i === 1 ? 'image/jpeg' : 'image/png')
    })
    expect(calls[0]![0]).not.toContain('صورة الشارع')
    expect(calls[1]![0]).toContain('-2-')
    expect(await mediaService.uploadPhotos([])).toEqual([])
    h.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await mediaService.uploadPhotos([files[0]!]))[0]).toMatch(/^anon\//)
    h.bucket.upload.mockResolvedValueOnce({ data: null, error: { message: 'UPLOAD_DENIED' } })
    await expect(mediaService.uploadPhotos([files[0]!])).rejects.toThrow('UPLOAD_DENIED')
  })
  it('الروابط ساعة واحدة، تتجاهل العناصر الناقصة، ولا تطلب الشبكة لقائمة فارغة', async () => {
    expect(await mediaService.signedUrls([])).toEqual({})
    expect(h.bucket.createSignedUrls).not.toHaveBeenCalled()
    h.state.result = { data: [null, { path: '', signedUrl: 'x' }, { path: 'p', signedUrl: '' }, { path: 'a', signedUrl: 'signed-a' }], error: null }
    expect(await mediaService.signedUrls(['a', 'b'])).toEqual({ a: 'signed-a' })
    expect(h.bucket.createSignedUrls).toHaveBeenCalledWith(['a', 'b'], 3600)
    h.state.result = { data: null, error: null }
    expect(await mediaService.signedUrls(['a'])).toEqual({})
    h.state.result = { data: null, error: { message: 'SIGN_DENIED' } }
    await expect(mediaService.signedUrls(['a'])).rejects.toThrow('SIGN_DENIED')
  })
  it('رفع الغلاف في مسار الإعلام، ويظهر خطأ التخزين ولا يعيد مساراً وهمياً', async () => {
    const file = new File(['x'], 'غلاف.jpg', { type: '' })
    expect(await mediaService.uploadCover(file)).toMatch(/^media-officer\/cover-\d+-.*$/)
    expect(h.bucket.upload).toHaveBeenCalledWith(expect.any(String), file, { contentType: 'image/jpeg', upsert: false })
    h.bucket.upload.mockResolvedValueOnce({ data: null, error: { message: 'COVER_DENIED' } })
    await expect(mediaService.uploadCover(file)).rejects.toThrow('COVER_DENIED')
  })
})

describe('media — تفاصيل التصميم وحفظ التقرير', () => {
  it('يفصل أوراق التقرير عن الصور ويطبع الافتراضيات، ويحفظ zoom=0 لا كقيمة غائبة', async () => {
    h.rpc.mockImplementation(async (name: unknown) => name === 'media_design_detail' ? { data: [{ photo_id: 'r1' }, { photo_id: 'r2', source_photo_id: 'p2', source_submission_id: 's2', work_type: 'كنس', storage_path: 'p', caption: 'أصل', report_caption: 'تقرير', display_fit: 'cover', display_zoom: '1.5', sort_order: '2' }], error: null } : { data: [{ work_type: 'كنس', sheet_text: 'ورقة' }, {}], error: null })
    const detail = await mediaService.designDetail('d1')
    expect(detail.design).toEqual({})
    expect(detail.photos[0]).toEqual({ photo_id: 'r1', source_photo_id: null, source_submission_id: null, work_type: '', storage_path: '', caption: null, report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 0 })
    expect(detail.photos[1]).toMatchObject({ photo_id: 'r2', display_fit: 'cover', display_zoom: 1.5, sort_order: 2, report_caption: 'تقرير' })
    expect(detail.sheets).toEqual([{ work_type: 'كنس', sheet_text: 'ورقة' }, { work_type: '', sheet_text: '' }])
    h.rpc.mockClear()
    await mediaService.saveDesignReport('d1', [{ workType: 'كنس', text: 'نص' }], [{ rowId: 'r1', text: 'صورة', fit: 'cover', zoom: 0 }], { summary: { total: 1 }, colors: { primary: '#000' }, style: { font: 'Cairo' } })
    expect(h.rpc).toHaveBeenLastCalledWith('media_design_report_save', { p_id: 'd1', p_sheets: [{ work_type: 'كنس', text: 'نص' }], p_captions: [{ row_id: 'r1', text: 'صورة', fit: 'cover', zoom: '0' }], p_summary: { total: 1 }, p_colors: { primary: '#000' }, p_style: { font: 'Cairo' } })
    expect(h.from).not.toHaveBeenCalled()              // وجود صور: ترويسة التصميم تأتي من صفوف الدالة نفسها بلا طلب إضافي
    h.rpc.mockImplementation(async (name: unknown) => ({ data: name === 'media_design_detail' ? [{}] : null, error: null }))
    const empty = await mediaService.designDetail('d2')
    expect(empty.sheets).toEqual([])
    expect(empty.photos[0]).toMatchObject({ photo_id: '', display_zoom: 1 })
  })
  it('تصميم بلا صور (الدالة ترجع صفر صفوف): يقرأ الترويسة من الجدول ويرجع photos=[] ولا يرمي — المحرر يفتح فارغاً', async () => {
    const design = { id: 'd1', title: 'تقرير اليوم', status: 'draft', photo_count: 0, period_type: 'day', sector_parent: 'karrada' }
    h.header.result = { data: design, error: null }
    h.rpc.mockImplementation(async (name: unknown) => ({ data: name === 'media_design_detail' ? [] : [{ work_type: 'كنس', sheet_text: 'ورقة' }], error: null }))
    const detail = await mediaService.designDetail('d1')
    expect(detail.design).toEqual(design)
    expect(detail.photos).toEqual([])
    expect(detail.sheets).toEqual([{ work_type: 'كنس', sheet_text: 'ورقة' }])
    expect(h.from).toHaveBeenCalledWith('media_designs')
    expect(h.chain.select).toHaveBeenCalledWith('*')
    expect(h.chain.eq).toHaveBeenCalledWith('id', 'd1')
  })
  it('صفر صفوف ثم اختفت الترويسة (حُذف بين الطلبين): MEDIA_DESIGN_NOT_FOUND بكود NOT_FOUND — وليس EMPTY', async () => {
    h.header.result = { data: null, error: null }
    h.rpc.mockImplementation(async (name: unknown) => ({ data: name === 'media_design_detail' ? [] : [], error: null }))
    const err = await mediaService.designDetail('gone').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('MEDIA_DESIGN_NOT_FOUND')
    expect((err as { code?: string }).code).toBe('NOT_FOUND')
  })
  it('خطأ الخادم MEDIA_DESIGN_NOT_FOUND من الدالة نفسها يمرّ كما هو ولا تُقرأ الترويسة', async () => {
    h.rpc.mockImplementation(async (name: unknown) => name === 'media_design_detail' ? { data: null, error: { message: 'MEDIA_DESIGN_NOT_FOUND' } } : { data: [], error: null })
    await expect(mediaService.designDetail('x')).rejects.toThrow('MEDIA_DESIGN_NOT_FOUND')
    expect(h.from).not.toHaveBeenCalled()
  })
  it('فشل قراءة الترويسة (شبكة/خادم) يُرفع كخطأ حقيقي ولا يُحوَّل إلى «غير موجود»', async () => {
    h.header.result = { data: null, error: { message: 'HEADER_503' } }
    h.rpc.mockImplementation(async (name: unknown) => ({ data: name === 'media_design_detail' ? [] : [], error: null }))
    await expect(mediaService.designDetail('d1')).rejects.toThrow('HEADER_503')
  })
  it('إنشاء/تحديث/إكمال/حذف التصميم وإضافة الصور وحذفها يمرر العقود الصحيحة', async () => {
    h.state.result = { data: { id: 'd1' }, error: null }
    await mediaService.createDesign('karrada', 'month', 'تقرير', '', [], '')
    expect(h.rpc).toHaveBeenLastCalledWith('media_design_create', { p_sector_parent: 'karrada', p_period_type: 'month', p_title: 'تقرير', p_cover_path: null, p_photos: [], p_ref_day: null })
    await mediaService.createDesign('karrada', 'day', 'تقرير', 'cover', [{ photoId: 'p1', workType: 'كنس', caption: 'نص' }], '2026-11-01')
    expect(args()).toMatchObject({ p_cover_path: 'cover', p_ref_day: '2026-11-01', p_photos: [{ photo_id: 'p1', work_type: 'كنس', caption: 'نص' }] })
    h.state.result = { data: null, error: null }
    expect(await mediaService.listDesigns()).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('media_designs_list', { p_sector_parent: null })
    h.state.result = { data: { id: 'd1' }, error: null }
    await mediaService.listDesigns('karrada'); expect(args()).toEqual({ p_sector_parent: 'karrada' })
    await mediaService.updateDesign('d1', { title: 'عنوان', periodType: 'month', coverPath: '', refDay: '' })
    expect(h.rpc).toHaveBeenLastCalledWith('media_design_update', { p_id: 'd1', p_title: 'عنوان', p_period_type: 'month', p_cover_path: null, p_ref_day: null })
    await mediaService.updateDesign('d1', { title: 'عنوان', periodType: 'day', coverPath: 'c', refDay: '2026-11-01' })
    expect(args()).toMatchObject({ p_cover_path: 'c', p_ref_day: '2026-11-01' })
    await mediaService.addDesignPhotos('d1', [{ photoId: 'p', workType: 'غسل', caption: 'ن' }])
    expect(h.rpc).toHaveBeenLastCalledWith('media_design_add_photos', { p_id: 'd1', p_photos: [{ photo_id: 'p', work_type: 'غسل', caption: 'ن' }] })
    await mediaService.completeDesign('d1'); expect(h.rpc).toHaveBeenLastCalledWith('media_design_complete', { p_id: 'd1' })
    await mediaService.deleteDesign('d1'); expect(h.rpc).toHaveBeenLastCalledWith('media_design_delete', { p_id: 'd1' })
    await mediaService.setDesignShift('d1', null); expect(h.rpc).toHaveBeenLastCalledWith('media_design_set_shift', { p_id: 'd1', p_shift: null })
    await mediaService.setDesignShift('d1', 'night'); expect(h.rpc).toHaveBeenLastCalledWith('media_design_set_shift', { p_id: 'd1', p_shift: 'night' })
    h.state.result = { data: 2, error: null }
    expect(await mediaService.removeDesignPhoto('r1')).toBe(2)
    expect(h.rpc).toHaveBeenLastCalledWith('media_design_photo_remove', { p_photo_row_id: 'r1' })
    expect(await mediaService.removeDesignPhotos([])).toBe(0)
    expect(await mediaService.removeDesignPhotos(['r1', 'r2'])).toBe(2)
    expect(h.rpc).toHaveBeenLastCalledWith('media_design_photos_remove', { p_photo_row_ids: ['r1', 'r2'] })
    h.state.result = { data: null, error: null }
    expect(await mediaService.removeDesignPhoto('r1')).toBe(0)
    expect(await mediaService.removeDesignPhotos(['r1'])).toBe(0)
    h.state.result = { data: null, error: { message: 'DESIGN_LOCKED' } }
    await expect(mediaService.completeDesign('d1')).rejects.toThrow('DESIGN_LOCKED')
    await expect(mediaService.deleteDesign('d1')).rejects.toThrow('DESIGN_LOCKED')
  })
})

describe('media — الغلافات والقوالب', () => {
  it('قوائم الغلافات والقوالب تتضمن المؤرشف فقط عند الطلب', async () => {
    expect(await mediaService.listCovers()).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('media_covers_list', { p_include_archived: false })
    await mediaService.listCovers(true); expect(args()).toEqual({ p_include_archived: true })
    expect(await mediaService.listTemplates()).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('media_templates_list', { p_include_archived: false })
    await mediaService.listTemplates(true); expect(args()).toEqual({ p_include_archived: true })
  })
  it('إضافة/تعديل الغلاف وحالته وشفته وعداد الاستخدام تمرر القيم دون فقدان null أو 0', async () => {
    h.state.result = { data: { id: 'c1' }, error: null }
    const input = { title: 'غلاف', sector: null, periodType: null, tags: '' }
    await mediaService.addCover('path', input)
    expect(h.rpc).toHaveBeenLastCalledWith('media_cover_add', { p_title: 'غلاف', p_storage_path: 'path', p_sector: null, p_period_type: null, p_tags: '' })
    await mediaService.updateCover('c1', { ...input, sector: 'karrada', periodType: 'month', tags: 'شتاء' })
    expect(h.rpc).toHaveBeenLastCalledWith('media_cover_update', { p_id: 'c1', p_title: 'غلاف', p_sector: 'karrada', p_period_type: 'month', p_tags: 'شتاء' })
    await mediaService.setCoverStatus('c1', 'archived'); expect(h.rpc).toHaveBeenLastCalledWith('media_cover_set_status', { p_id: 'c1', p_status: 'archived' })
    await mediaService.setCoverShift('c1', null); expect(h.rpc).toHaveBeenLastCalledWith('media_cover_set_shift', { p_id: 'c1', p_shift: null })
    h.state.result = { data: 0, error: null }
    expect(await mediaService.touchCover('c1')).toBe(0)
    h.state.result = { data: '3', error: null }
    expect(await mediaService.touchCover('c1')).toBe(3)
    h.state.result = { data: null, error: null }
    expect(await mediaService.touchCover('c1')).toBe(0)
  })
  it('إنشاء القالب وتحديثه وأرشفته يحفظ الأنواع والملاحظات، وأخطاء الصلاحيات لا تتحول إلى نجاح', async () => {
    h.state.result = { data: { id: 't1' }, error: null }
    const input = { title: 'قالب', sectorParent: 'karrada', periodType: 'month', coverPath: 'c', workTypes: ['كنس', 'غسل'], notes: 'م' }
    await mediaService.createTemplate(input)
    expect(h.rpc).toHaveBeenLastCalledWith('media_template_create', { p_title: 'قالب', p_sector_parent: 'karrada', p_period_type: 'month', p_cover_path: 'c', p_work_types: ['كنس', 'غسل'], p_notes: 'م' })
    await mediaService.updateTemplate('t1', input)
    expect(h.rpc).toHaveBeenLastCalledWith('media_template_update', { p_id: 't1', p_title: 'قالب', p_sector_parent: 'karrada', p_period_type: 'month', p_cover_path: 'c', p_work_types: ['كنس', 'غسل'], p_notes: 'م' })
    await mediaService.archiveTemplate('t1'); expect(h.rpc).toHaveBeenLastCalledWith('media_template_archive', { p_id: 't1' })
    h.state.result = { data: null, error: { message: 'TEMPLATE_DENIED' } }
    await expect(mediaService.archiveTemplate('t1')).rejects.toThrow('TEMPLATE_DENIED')
    await expect(mediaService.updateTemplate('t1', input)).rejects.toThrow('TEMPLATE_DENIED')
  })
})
