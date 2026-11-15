/** عقود إضافية لـ SDK مسؤول القسم: القواطع/الفريق/المستلزمات/الأعطال/الصور/الحضور والملخص. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { result: { data: [] as unknown, error: null as null | { message: string } } }
  const queries: Array<{ table: string; calls: Array<[string, unknown[]]> }> = []
  const chain = (table: string) => {
    const calls: Array<[string, unknown[]]> = []
    queries.push({ table, calls })
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'is', 'not', 'eq', 'upsert', 'update', 'maybeSingle', 'returns']) c[m] = vi.fn((...args: unknown[]) => { calls.push([m, args]); return c })
    c.then = (resolve: (v: typeof state.result) => unknown) => Promise.resolve(state.result).then(resolve)
    return c
  }
  const bucket = { upload: vi.fn(async (..._args: unknown[]): Promise<{ data: { path: string } | null; error: null | { message: string } }> => ({ data: { path: 'p' }, error: null })), createSignedUrl: vi.fn(async (path: string, _ttl?: number): Promise<{ data: { signedUrl: string } | null; error: null | { message: string } }> => ({ data: { signedUrl: `signed:${path}` }, error: null })) }
  return { state, queries, bucket, rpc: vi.fn(async (..._args: unknown[]) => state.result), from: vi.fn(chain), storageFrom: vi.fn(() => bucket), getUser: vi.fn(async () => ({ data: { user: { id: 'manager-1' } } })), compress: vi.fn(async (file: File) => file) }
})
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc, from: h.from, storage: { from: h.storageFrom }, auth: { getUser: h.getUser } },
  sdkGuard: async (value: PromiseLike<{ data: unknown; error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data },
  sdkVoid: async (value: PromiseLike<{ error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message) },
}))
vi.mock('@lib/media/image-compress', () => ({ compressImage: h.compress }))
import { sector, sectorTeam, sectorSupplies, sectorBreakdowns, sectorPhotos, sectorAttendance, sectorSummary } from '@sdk/sector.sdk'

const calls = () => h.queries.at(-1)!.calls
const arg = (method: string) => calls().find(([m]) => m === method)?.[1]
beforeEach(() => { h.state.result = { data: [], error: null }; h.rpc.mockClear(); h.from.mockClear(); h.queries.length = 0; h.storageFrom.mockClear(); h.bucket.upload.mockClear(); h.bucket.createSignedUrl.mockClear(); h.getUser.mockClear(); h.compress.mockClear(); h.bucket.upload.mockResolvedValue({ data: { path: 'p' }, error: null }); h.bucket.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'signed:p' }, error: null }) })

describe('sector — القواطع وملف المدير', () => {
  it('listSectors يطبّع القيم الغائبة ويحفظ القاطع الأب', async () => {
    h.state.result = { data: [{ id: '3', code: 'K3', name: 'الوليد', sort: '7', parent_sector: 'karrada' }, { id: 4 }], error: null }
    expect(await sector.listSectors()).toEqual([{ id: 3, code: 'K3', name: 'الوليد', sort: 7, parent_sector: 'karrada' }, { id: 4, code: '', name: '', sort: 0, parent_sector: 'karrada' }])
    expect(h.from).toHaveBeenCalledWith('sectors')
    expect(arg('order')).toEqual(['sort'])
    h.state.result = { data: null, error: null }
    expect(await sector.listSectors()).toEqual([])
  })
  it('ملف المدير: null صريح، قطاعات غير مصفوفة تصبح فارغة، والحفظ upsert على user_id', async () => {
    h.state.result = { data: null, error: null }
    expect(await sector.myProfile()).toBeNull()
    expect(await sector.managerProfileForUser('u')).toBeNull()
    expect(arg('eq')).toEqual(['user_id', 'u'])
    h.state.result = { data: { user_id: 'u', shift: 'night', sectors: [1, 2] }, error: null }
    expect(await sector.myProfile()).toEqual({ user_id: 'u', shift: 'night', sectors: [1, 2] })
    h.state.result = { data: { user_id: 'u' }, error: null }
    expect(await sector.managerProfileForUser('u')).toEqual({ user_id: 'u', shift: 'morning', sectors: [] })
    await sector.upsertManagerProfile('u', 'morning', [3])
    expect(arg('upsert')).toEqual([{ user_id: 'u', shift: 'morning', sectors: [3] }, { onConflict: 'user_id' }])
    h.state.result = { data: null, error: { message: 'PROFILE_DENIED' } }
    await expect(sector.myProfile()).rejects.toThrow('PROFILE_DENIED')
    await expect(sector.managerProfileForUser('u')).rejects.toThrow('PROFILE_DENIED')
  })
})

describe('sectorTeam — العمال والآليات', () => {
  it('القوائم النشطة والمؤرشفة تستخدم فلتر archived_at الصحيح وتطبع الصفوف', async () => {
    h.state.result = { data: [{ id: 'w1' }, { id: 'w2', full_name: 'علي', phone: '07', sector_id: '3', shift: 'night', job_title: 'سائق', created_by: 'm', archived_at: 'a', archive_reason: 'r', created_at: 'c' }], error: null }
    const workers = await sectorTeam.listWorkers()
    expect(h.from).toHaveBeenCalledWith('sector_workers')
    expect(arg('is')).toEqual(['archived_at', null])
    expect(workers[0]).toMatchObject({ id: 'w1', full_name: '', phone: null, sector_id: NaN, shift: 'morning', job_title: null })
    expect(workers[1]).toMatchObject({ id: 'w2', full_name: 'علي', sector_id: 3, shift: 'night', archive_reason: 'r' })
    await sectorTeam.listWorkers(false)
    expect(arg('not')).toEqual(['archived_at', 'is', null])
    h.state.result = { data: [{ id: 'v1' }, { id: 'v2', db_number: 'DB', vehicle_type: 'كابسة', sector_id: '4', shift: 'night', driver_name: 'حسن', created_by: 'm', archived_at: null, archive_reason: null, created_at: 'c' }], error: null }
    const vehicles = await sectorTeam.listVehicles()
    expect(h.from).toHaveBeenCalledWith('sector_vehicles')
    expect(vehicles[0]).toMatchObject({ db_number: '', vehicle_type: null, driver_name: null, shift: 'morning' })
    expect(vehicles[1]).toMatchObject({ db_number: 'DB', sector_id: 4, driver_name: 'حسن' })
    await sectorTeam.listVehicles(false)
    expect(arg('not')).toEqual(['archived_at', 'is', null])
    h.state.result = { data: null, error: null }
    expect(await sectorTeam.listWorkers()).toEqual([])
    expect(await sectorTeam.listVehicles()).toEqual([])
  })
  it('إنشاء العامل/الآلية يمرر الاختياري null والتحديث/الأرشفة يحددان السجل', async () => {
    h.state.result = { data: { id: 'w1', full_name: 'علي', sector_id: 3, shift: 'morning' }, error: null }
    expect(await sectorTeam.createWorker({ full_name: 'علي', sector_id: 3, shift: 'morning' })).toMatchObject({ id: 'w1', phone: null, job_title: null })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_add_worker', { p_full_name: 'علي', p_sector_id: 3, p_shift: 'morning', p_phone: null, p_job_title: null })
    await sectorTeam.createWorker({ full_name: 'حسن', sector_id: 4, shift: 'night', phone: '07', job_title: 'سائق' })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_add_worker', { p_full_name: 'حسن', p_sector_id: 4, p_shift: 'night', p_phone: '07', p_job_title: 'سائق' })
    await sectorTeam.updateWorker('w1', { full_name: 'جديد' })
    expect(arg('update')).toEqual([{ full_name: 'جديد' }])
    expect(arg('eq')).toEqual(['id', 'w1'])
    await sectorTeam.archiveWorker('w1', 'سبب')
    expect(arg('update')?.[0]).toMatchObject({ archive_reason: 'سبب', archived_at: expect.any(String) })
    h.state.result = { data: { id: 'v1', db_number: 'DB', sector_id: 3, shift: 'morning' }, error: null }
    expect(await sectorTeam.createVehicle({ db_number: 'DB', sector_id: 3, shift: 'morning' })).toMatchObject({ id: 'v1', vehicle_type: null, driver_name: null })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_add_vehicle', { p_db_number: 'DB', p_sector_id: 3, p_shift: 'morning', p_vehicle_type: null, p_driver_name: null })
    await sectorTeam.createVehicle({ db_number: 'DB2', sector_id: 4, shift: 'night', vehicle_type: 'حوضية', driver_name: 'حسن' })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_add_vehicle', { p_db_number: 'DB2', p_sector_id: 4, p_shift: 'night', p_vehicle_type: 'حوضية', p_driver_name: 'حسن' })
    await sectorTeam.updateVehicle('v1', { driver_name: 'علي' })
    expect(arg('update')).toEqual([{ driver_name: 'علي' }])
    await sectorTeam.archiveVehicle('v1', 'تعطل')
    expect(arg('update')?.[0]).toMatchObject({ archive_reason: 'تعطل' })
    h.state.result = { data: null, error: { message: 'TEAM_DENIED' } }
    await expect(sectorTeam.createWorker({ full_name: 'x', sector_id: 1, shift: 'morning' })).rejects.toThrow('TEAM_DENIED')
    await expect(sectorTeam.createVehicle({ db_number: 'x', sector_id: 1, shift: 'morning' })).rejects.toThrow('TEAM_DENIED')
  })
})

describe('sectorSupplies + sectorBreakdowns — تطبيع الكتب والأعطال', () => {
  it('المستلزمات: active/archived، إنشاء مباشر، والقيم الغائبة لا تصبح نصوصاً خاطئة', async () => {
    h.state.result = { data: [{ id: 's1' }, { id: 's2', manager_id: 'm', manager_name: 'مدير', shift: 'night', sectors: [3], supply_type: 'وقود', quantity: '5', notes: 'ن', signed: true, ref_no: 'R', status: 'submitted_to_deputy', submitted_at: 't', archived_at: null, archive_reason: null, created_at: 'c' }], error: null }
    const rows = await sectorSupplies.list()
    expect(h.from).toHaveBeenCalledWith('sector_supply_requests')
    expect(arg('is')).toEqual(['archived_at', null])
    expect(rows[0]).toMatchObject({ manager_id: '', manager_name: '', shift: 'morning', sectors: [], quantity: 0, signed: false, status: 'draft', ref_no: null })
    expect(rows[1]).toMatchObject({ quantity: 5, signed: true, status: 'submitted_to_deputy', sectors: [3] })
    await sectorSupplies.list('archived')
    expect(arg('not')).toEqual(['archived_at', 'is', null])
    h.state.result = { data: { id: 's3', supply_type: 'وقود', quantity: 2, signed: false }, error: null }
    expect(await sectorSupplies.create({ supply_type: 'وقود', quantity: 2, signed: false })).toMatchObject({ id: 's3', notes: null, status: 'draft' })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_submit_supply', { p_supply_type: 'وقود', p_quantity: 2, p_notes: null, p_signed: false })
    await sectorSupplies.create({ supply_type: 'ماء', quantity: 1, signed: true, notes: 'عاجل' })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_submit_supply', { p_supply_type: 'ماء', p_quantity: 1, p_notes: 'عاجل', p_signed: true })
    h.state.result = { data: null, error: { message: 'SUPPLY_DENIED' } }
    await expect(sectorSupplies.create({ supply_type: 'x', quantity: 1, signed: false })).rejects.toThrow('SUPPLY_DENIED')
  })
  it('الأعطال: القائمة المؤرشفة والإنشاء يطبعان الحقول ولا يبتلعان خطأ الخادم', async () => {
    h.state.result = { data: [{ id: 'b1' }, { id: 'b2', manager_id: 'm', manager_name: 'مدير', shift: 'night', sectors: [2], db_number: 'DB', fault_type: 'محرك', notes: 'ن', status: 'resolved', departure_id: 'd', vehicle_id: 'v', resolved_at: 'r', resolved_by: 'u', resolution_notes: 'تم', archived_at: 'a', archive_reason: 'س', created_at: 'c' }], error: null }
    const rows = await sectorBreakdowns.list('archived')
    expect(arg('not')).toEqual(['archived_at', 'is', null])
    expect(rows[0]).toMatchObject({ manager_id: '', shift: 'morning', sectors: [], db_number: '', fault_type: '', status: 'logged', departure_id: null, resolution_notes: null })
    expect(rows[1]).toMatchObject({ status: 'resolved', departure_id: 'd', vehicle_id: 'v', resolution_notes: 'تم' })
    h.state.result = { data: { id: 'b3', db_number: 'DB', fault_type: 'عطل' }, error: null }
    expect(await sectorBreakdowns.create({ db_number: 'DB', fault_type: 'عطل' })).toMatchObject({ id: 'b3', notes: null, status: 'logged' })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_submit_breakdown', { p_db_number: 'DB', p_fault_type: 'عطل', p_notes: null })
    await sectorBreakdowns.create({ db_number: 'DB', fault_type: 'عطل', notes: 'وصف' })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_submit_breakdown', { p_db_number: 'DB', p_fault_type: 'عطل', p_notes: 'وصف' })
    h.state.result = { data: null, error: { message: 'BREAK_DENIED' } }
    await expect(sectorBreakdowns.create({ db_number: 'x', fault_type: 'y' })).rejects.toThrow('BREAK_DENIED')
  })
})

describe('sectorPhotos + sectorAttendance + sectorSummary', () => {
  it('الصور: رفع باسم آمن تحت هوية المستخدم، تسجيل RPC، ورابط مؤقت 30 دقيقة', async () => {
    h.state.result = { data: { id: 'p1', storage_path: 'manager-1/photo.jpg', caption: 'صورة' }, error: null }
    const file = new File(['x'], 'صورة عمل.jpg', { type: 'image/jpeg' })
    expect(await sectorPhotos.upload(file, 'صورة')).toMatchObject({ id: 'p1', manager_id: '', shift: 'morning', sectors: [], caption: 'صورة' })
    expect(h.compress).toHaveBeenCalledWith(file)
    expect(h.storageFrom).toHaveBeenCalledWith('sector-photos')
    const [path, uploaded, options] = h.bucket.upload.mock.calls[0] as unknown as [string, File, Record<string, unknown>]
    expect(path).toMatch(/^manager-1\/\d+-.*\.jpg$/)
    expect(uploaded).toBe(file)
    expect(options).toEqual({ contentType: 'image/jpeg', upsert: false })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_register_photo', { p_storage_path: path, p_caption: 'صورة' })
    expect(await sectorPhotos.signedUrl('a/b.jpg')).toBe('signed:p')
    expect(h.bucket.createSignedUrl).toHaveBeenCalledWith('a/b.jpg', 1800)
    h.state.result = { data: [{ id: 'p2' }, { id: 'p3', manager_id: 'm', manager_name: 'م', shift: 'night', sectors: [1], caption: 'ن', storage_path: 's', archived_at: 'a', archive_reason: 'r', created_at: 'c' }], error: null }
    expect((await sectorPhotos.list())[0]).toMatchObject({ manager_id: '', caption: null, storage_path: '', sectors: [] })
    await sectorPhotos.list('archived')
    expect(arg('not')).toEqual(['archived_at', 'is', null])
    h.bucket.upload.mockResolvedValueOnce({ data: null, error: { message: 'UPLOAD_DENIED' } })
    await expect(sectorPhotos.upload(file, '')).rejects.toThrow('UPLOAD_DENIED')
    h.state.result = { data: null, error: { message: 'REGISTER_DENIED' } }
    await expect(sectorPhotos.upload(file, '')).rejects.toThrow('REGISTER_DENIED')
    h.bucket.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'SIGN_DENIED' } })
    await expect(sectorPhotos.signedUrl('x')).rejects.toThrow('SIGN_DENIED')
  })
  it('الحضور يفلتر اليوم والسجلات غير المؤرشفة، ويحفظ present=false دون تحويلها إلى true', async () => {
    h.state.result = { data: [{ id: 'a1', is_present: false }, { id: 'a2', manager_id: 'm', worker_id: 'w', worker_name: 'علي', sector_id: '3', shift: 'night', log_date: '2026-11-01', is_present: true, note: 'ن', archived_at: null, created_at: 'c' }], error: null }
    const rows = await sectorAttendance.listByDate('2026-11-01')
    expect(h.from).toHaveBeenCalledWith('sector_attendance')
    expect(arg('eq')).toEqual(['log_date', '2026-11-01'])
    expect(arg('is')).toEqual(['archived_at', null])
    expect(rows[0]).toMatchObject({ manager_id: '', worker_id: '', worker_name: '', shift: 'morning', log_date: '', is_present: false, note: null })
    expect(rows[1]).toMatchObject({ sector_id: 3, is_present: true, note: 'ن' })
    await sectorAttendance.upsert({ worker_id: 'w', worker_name: 'علي', sector_id: 3, shift: 'morning', log_date: '2026-11-01', is_present: false })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_set_attendance', { p_worker_id: 'w', p_log_date: '2026-11-01', p_is_present: false, p_note: null })
    await sectorAttendance.upsert({ worker_id: 'w', worker_name: 'علي', sector_id: 3, shift: 'morning', log_date: '2026-11-01', is_present: true, note: 'حضر' })
    expect(h.rpc).toHaveBeenLastCalledWith('sector_set_attendance', { p_worker_id: 'w', p_log_date: '2026-11-01', p_is_present: true, p_note: 'حضر' })
    h.state.result = { data: null, error: { message: 'ATT_DENIED' } }
    await expect(sectorAttendance.upsert({ worker_id: 'w', worker_name: 'علي', sector_id: 3, shift: 'morning', log_date: 'd', is_present: true })).rejects.toThrow('ATT_DENIED')
  })
  it('الملخص يجمع القوائم الست ويعد الحالات دون تعديل بيانات', async () => {
    h.state.result = { data: [], error: null }
    const summary = await sectorSummary()
    expect(summary).toEqual({ workers: 0, vehicles: 0, pending_supply: 0, submitted_supply: 0, breakdowns: 0, photos: 0, present_today: 0, absent_today: 0 })
    expect(h.from.mock.calls.map(([t]) => t)).toEqual(expect.arrayContaining(['sector_workers', 'sector_vehicles', 'sector_supply_requests', 'sector_breakdowns', 'sector_photos', 'sector_attendance']))
  })
})
