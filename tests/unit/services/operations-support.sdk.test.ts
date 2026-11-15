/** عقود SDK وحدات مساندة: تعديل الحضور، كشوفات العمليات، المتعهدين، دعم الدخول، بقع GPS، والتصفير. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { result: { data: [] as unknown, error: null as null | { message: string; code?: string } } }
  const bucket = { remove: vi.fn(async (..._args: unknown[]): Promise<{ data: unknown[] | null; error: null | { message: string } }> => ({ data: [], error: null })), upload: vi.fn(async (..._args: unknown[]) => ({ data: { path: 'p' }, error: null })), createSignedUrl: vi.fn(async (path: string, _ttl?: number) => ({ data: { signedUrl: `signed:${path}` }, error: null as null | { message: string } })) }
  return {
    state, bucket,
    rpc: vi.fn(async (..._args: unknown[]) => state.result),
    invoke: vi.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: null | { message: string; code?: string; context?: Response } }> => ({ data: state.result.data, error: state.result.error })),
    storageFrom: vi.fn(() => bucket),
    getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
    compress: vi.fn(async (file: File) => file),
    warehouseRun: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  }
})
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc, functions: { invoke: h.invoke }, storage: { from: h.storageFrom }, auth: { getUser: h.getUser } },
  sdkGuard: async (value: PromiseLike<{ data: unknown; error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data },
  sdkVoid: async (value: PromiseLike<{ error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message) },
}))
vi.mock('@lib/media/image-compress', () => ({ compressImage: h.compress }))
vi.mock('@sdk/gps-warehouse.sdk', () => ({ gpsWarehouse: { run: h.warehouseRun } }))
import { attendanceEdits, attendanceEditErrorMessage, enumerateDays, hmBaghdad, composeBaghdad } from '@sdk/attendance-edits.sdk'
import { disclosuresUnit, disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'
import { contractors } from '@sdk/contractors.sdk'
import { loginSupport } from '@sdk/login-support.sdk'
import { gpsHotspots } from '@sdk/gps-hotspots.sdk'
import { platformReset } from '@sdk/platform-reset.sdk'
import { LvnSyncError } from '@sdk/gps-lvn.sdk'

const lastArgs = () => h.rpc.mock.lastCall?.[1]
beforeEach(() => {
  h.state.result = { data: [], error: null }
  h.rpc.mockClear(); h.invoke.mockClear(); h.storageFrom.mockClear(); h.getUser.mockClear(); h.compress.mockClear(); h.warehouseRun.mockClear()
  h.bucket.remove.mockClear(); h.bucket.upload.mockClear(); h.bucket.createSignedUrl.mockClear()
  h.bucket.remove.mockResolvedValue({ data: [], error: null })
  h.invoke.mockResolvedValue({ data: { ok: true }, error: null })
  h.warehouseRun.mockResolvedValue({ ok: true })
})

describe('attendanceEdits — المعاينة والطلب والقرار', () => {
  const draft = { scopeKind: 'employees' as const, scopeIds: ['e1'], dates: ['2026-11-01'], action: 'set_times' as const, payload: { check_in: '08:00', check_out: '14:00' } }
  it('المعاينة والإنشاء يحافظان على النطاق والأيام ونوع الإجراء', async () => {
    await attendanceEdits.preview(draft)
    expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_preview', { p_scope_kind: 'employees', p_scope_ids: ['e1'], p_dates: ['2026-11-01'], p_action: 'set_times', p_payload: draft.payload })
    await attendanceEdits.create(draft, ' سبب ', 'hr_request')
    expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_create', { p_scope_kind: 'employees', p_scope_ids: ['e1'], p_dates: ['2026-11-01'], p_action: 'set_times', p_payload: draft.payload, p_reason: ' سبب ', p_mode: 'hr_request' })
  })
  it('القائمة: الافتراضيات null/300، والفلاتر الصريحة تشذب البحث', async () => {
    await attendanceEdits.list()
    expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_list', { p_from: null, p_to: null, p_mode: null, p_status: null, p_department: null, p_employee: null, p_actor: null, p_search: null, p_limit: 300 })
    await attendanceEdits.list({ from: 'a', to: 'b', mode: 'direct', status: 'applied', departmentId: 'd', employeeId: 'e', actorId: 'u', search: ' علي ', limit: 10 })
    expect(lastArgs()).toEqual({ p_from: 'a', p_to: 'b', p_mode: 'direct', p_status: 'applied', p_department: 'd', p_employee: 'e', p_actor: 'u', p_search: 'علي', p_limit: 10 })
    await attendanceEdits.searchEmployees('  ')
    expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_employee_search', { p_search: null })
    await attendanceEdits.searchEmployees(' علي ')
    expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_employee_search', { p_search: 'علي' })
    await attendanceEdits.stats()
    expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_stats', { p_month: null })
    await attendanceEdits.stats('2026-11')
    expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_stats', { p_month: '2026-11' })
  })
  it('إجراءات HR والتراجع تمرر السبب/الملاحظة ولا تحول النص الفارغ إلى قيمة غير مقصودة', async () => {
    await attendanceEdits.detail('r1'); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_detail', { p_id: 'r1' })
    await attendanceEdits.cancel('r1'); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_cancel', { p_id: 'r1', p_reason: null })
    await attendanceEdits.cancel('r1', 'سبب'); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_cancel', { p_id: 'r1', p_reason: 'سبب' })
    await attendanceEdits.hrUpdateItem('i1', 'auto', null, null); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_hr_update_item', { p_item: 'i1', p_status: 'auto', p_check_in: null, p_check_out: null })
    await attendanceEdits.hrSkipItem('i1', 'ناقص'); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_hr_skip_item', { p_item: 'i1', p_reason: 'ناقص' })
    await attendanceEdits.hrApply('r1'); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_hr_apply', { p_id: 'r1', p_note: null })
    await attendanceEdits.hrApply('r1', 'اعتماد'); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_hr_apply', { p_id: 'r1', p_note: 'اعتماد' })
    await attendanceEdits.revert('r1', 'خطأ'); expect(h.rpc).toHaveBeenLastCalledWith('attendance_edit_revert', { p_id: 'r1', p_reason: 'خطأ' })
    expect(attendanceEditErrorMessage(new Error('ATT_EDIT_TOO_MANY_DAYS'))).toContain('62')
    expect(attendanceEditErrorMessage('UNKNOWN_CODE')).toBe('UNKNOWN_CODE')
    expect(attendanceEditErrorMessage(new Error(''))).toBe('خطأ غير معروف')
  })
  it('مساعدات الأيام وتوقيت بغداد: مدى شامل، حد أقصى، وخروج بعد منتصف الليل', () => {
    expect(enumerateDays('', 'b')).toEqual([])
    expect(enumerateDays('2026-11-02', '2026-11-01')).toEqual([])
    expect(enumerateDays('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(enumerateDays('2026-11-01', '2026-11-10', 3)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(hmBaghdad(null)).toBe('—')
    expect(hmBaghdad('2026-11-01T05:30:00Z')).toBe('08:30')
    expect(composeBaghdad('2026-11-01', '')).toBeNull()
    expect(composeBaghdad('2026-11-01', '08:30')).toBe('2026-11-01T05:30:00.000Z')
    expect(composeBaghdad('2026-11-01', '02:00', true)).toBe('2026-11-01T23:00:00.000Z')
  })
})

describe('disclosuresUnit — الكشوفات والصلاحيات والإخفاء', () => {
  it('الأنواع والبحث والحفظ والقرارات تمرر أسماء RPC والقيم الاختيارية', async () => {
    await disclosuresUnit.types(); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_types_list', {})
    await disclosuresUnit.saveType({ key: 'speeding', label: 'سرعة', allowed_penalties: ['fine'], is_active: true, sort_order: 2 })
    expect(h.rpc).toHaveBeenLastCalledWith('disclosure_type_save', { p_key: 'speeding', p_label: 'سرعة', p_description: null, p_allowed_penalties: ['fine'], p_default_amount: null, p_is_active: true, p_sort_order: 2, p_min_amount: null, p_max_amount: null })
    await disclosuresUnit.saveType({ key: 'x', label: 'ن', description: 'و', allowed_penalties: ['warning'], default_amount: 5, is_active: false, sort_order: 1, min_amount: 1, max_amount: 9 })
    expect(lastArgs()).toMatchObject({ p_description: 'و', p_default_amount: 5, p_min_amount: 1, p_max_amount: 9 })
    await disclosuresUnit.vehicles(' DB '); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_vehicle_lookup', { p_q: 'DB', p_limit: 20 })
    await disclosuresUnit.employees('  '); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_employee_lookup', { p_q: null, p_limit: 20 })
    const input = { target_kind: 'employee' as const, employee_id: 'e1', log_date: '2026-11-01', violation_type: 'x', details: 'تفاصيل' }
    await disclosuresUnit.save(null, input); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_save', { p_id: null, p: input })
    await disclosuresUnit.submit('d1'); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_submit', { p_id: 'd1' })
    await disclosuresUnit.decide('d1', true); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_decide', { p_id: 'd1', p_approve: true, p_note: null, p_amount: null })
    await disclosuresUnit.decide('d1', false, 'سبب', 0); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_decide', { p_id: 'd1', p_approve: false, p_note: 'سبب', p_amount: 0 })
    await disclosuresUnit.cancel('d1', 'سبب'); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_cancel', { p_id: 'd1', p_reason: 'سبب' })
    await disclosuresUnit.get('d1'); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_get', { p_id: 'd1' })
    await disclosuresUnit.inbox(); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_inbox', {})
  })
  it('القائمة والتقرير والإحصاءات تطبع الشهر إلى أول يوم وتحافظ على الفلاتر', async () => {
    await disclosuresUnit.list()
    expect(h.rpc).toHaveBeenLastCalledWith('disclosures_list', { p_scope: 'active', p_from: null, p_to: null, p_type: null, p_q: null, p_month: null, p_limit: 500 })
    await disclosuresUnit.list({ scope: 'archive', from: 'a', to: 'b', type: 'x', q: ' علي ', month: '2026-11-15', limit: 7 })
    expect(lastArgs()).toEqual({ p_scope: 'archive', p_from: 'a', p_to: 'b', p_type: 'x', p_q: 'علي', p_month: '2026-11-01', p_limit: 7 })
    await disclosuresUnit.report({ from: 'a', to: 'b' }); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_report', { p_from: 'a', p_to: 'b', p_type: null, p_sector: null })
    await disclosuresUnit.report({ from: 'a', to: 'b', type: 'x', sector: 'karrada' }); expect(lastArgs()).toMatchObject({ p_type: 'x', p_sector: 'karrada' })
    await disclosuresUnit.preparers(); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_preparers', { p_month: null })
    await disclosuresUnit.preparers('2026-11'); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_preparers', { p_month: '2026-11-01' })
    await disclosuresUnit.stats(); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_stats', { p_month: null })
    await disclosuresUnit.stats('2026-11'); expect(h.rpc).toHaveBeenLastCalledWith('disclosure_stats', { p_month: '2026-11-01' })
    await disclosuresUnit.myHiddenUnits(); expect(h.rpc).toHaveBeenLastCalledWith('my_hidden_units', {})
    await disclosuresUnit.hiddenUnitsGet('u', 'hr'); expect(h.rpc).toHaveBeenLastCalledWith('it_hidden_units_get', { p_user: 'u', p_portal: 'hr' })
    await disclosuresUnit.hiddenUnitsSet('u', 'hr', ['/hr/biometric']); expect(h.rpc).toHaveBeenLastCalledWith('it_hidden_units_set', { p_user: 'u', p_portal: 'hr', p_paths: ['/hr/biometric'] })
    expect(disclosureErrorMessage(new Error('DISCLOSURE_NOT_EDITABLE'))).toContain('مسودة')
    expect(disclosureErrorMessage('')).toBe('حدث خطأ غير متوقع')
    h.state.result = { data: null, error: { message: 'DISCLOSURE_FORBIDDEN' } }
    await expect(disclosuresUnit.types()).rejects.toThrow('DISCLOSURE_FORBIDDEN')
  })
})

describe('contractors — الأجور والبوابة والإسناد', () => {
  it('الأجور تستخدم أول الشهر، والنتيجة الفارغة لا تخترع سجلاً', async () => {
    h.state.result = { data: [{ month: '2026-11-01', approved: true }], error: null }
    expect(await contractors.wagesMonthStatus('2026-11-15')).toEqual({ month: '2026-11-01', approved: true })
    expect(h.rpc).toHaveBeenLastCalledWith('finance_contractor_month_status', { p_month: '2026-11-01' })
    h.state.result = { data: [], error: null }
    expect(await contractors.wagesMonthStatus('2026-11')).toBeNull()
    expect(await contractors.wagesSheet('2026-11')).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('finance_contractor_wages_sheet', { p_month: '2026-11-01' })
    expect(await contractors.wageDays('c1', '2026-11')).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('finance_contractor_wage_days', { p_contractor: 'c1', p_month: '2026-11-01' })
    await contractors.setRates({ contractorId: 'c1', month: '2026-11', contractorDaily: 20, workerDaily: 10 })
    expect(h.rpc).toHaveBeenLastCalledWith('finance_contractor_rates_set', { p_contractor: 'c1', p_month: '2026-11-01', p_contractor_daily: 20, p_worker_daily: 10, p_note: null })
    h.state.result = { data: 4, error: null }
    expect(await contractors.copyPreviousRates('2026-11')).toBe(4)
    h.state.result = { data: null, error: null }
    expect(await contractors.copyPreviousRates('2026-11')).toBe(0)
  })
  it('بوابة المتعهد: me/myMonth/headcount والإسناد تشذب السبب', async () => {
    h.state.result = { data: [{ user_id: 'c1' }], error: null }
    expect(await contractors.me()).toEqual({ user_id: 'c1' })
    expect(h.rpc).toHaveBeenLastCalledWith('contractor_me')
    h.state.result = { data: [], error: null }
    expect(await contractors.me()).toBeNull()
    await contractors.myMonth(); expect(h.rpc).toHaveBeenLastCalledWith('contractor_my_month', { p_month: null })
    await contractors.myMonth('2026-11'); expect(h.rpc).toHaveBeenLastCalledWith('contractor_my_month', { p_month: '2026-11' })
    await contractors.setHeadcount(5); expect(h.rpc).toHaveBeenLastCalledWith('contractor_set_headcount', { p_headcount: 5 })
    expect(await contractors.managerOptions()).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('contractor_manager_options')
    expect(await contractors.profileForUser('c1')).toBeNull()
    expect(h.rpc).toHaveBeenLastCalledWith('contractor_profile_for_user', { p_user_id: 'c1' })
    await contractors.assign('c1', 'm1'); expect(h.rpc).toHaveBeenLastCalledWith('contractor_assign', { p_user_id: 'c1', p_manager_user_id: 'm1', p_sector_id: null, p_notes: null })
    await contractors.assign('c1', 'm1', 3, ' سبب '); expect(h.rpc).toHaveBeenLastCalledWith('contractor_assign', { p_user_id: 'c1', p_manager_user_id: 'm1', p_sector_id: 3, p_notes: 'سبب' })
    await contractors.unassign('c1', ' سبب '); expect(h.rpc).toHaveBeenLastCalledWith('contractor_unassign', { p_user_id: 'c1', p_reason: 'سبب' })
    expect(await contractors.managerTeamSummary()).toEqual([])
    expect(h.rpc).toHaveBeenLastCalledWith('manager_team_summary')
    h.state.result = { data: [{ contractor_user_id: 'c1', tickets_today: 1, photos_today: 2 }], error: null }
    expect(await contractors.managerContractorPhotosToday()).toEqual([{ contractor_user_id: 'c1', tickets_today: 1, photos_today: 2 }])
    h.state.result = { data: null, error: { message: 'PHOTOS_DENIED', code: '42501' } }
    await expect(contractors.managerContractorPhotosToday()).rejects.toMatchObject({ message: 'PHOTOS_DENIED', code: '42501' })
  })
  it('checkin يرفع الصورتين المضغوطتين ثم يسجل الموقع والعدد، وsignedUrl مدته 30 دقيقة', async () => {
    const selfie = new File(['s'], 'selfie.jpg', { type: 'image/jpeg' })
    const team = new File(['t'], 'team.png', { type: 'image/png' })
    await contractors.checkin({ latitude: 33.3, longitude: 44.4, accuracy: 8, selfie, teamPhoto: team, headcount: 6 })
    expect(h.compress).toHaveBeenCalledTimes(2)
    expect(h.storageFrom).toHaveBeenCalledWith('contractor-photos')
    const paths = h.bucket.upload.mock.calls.map((c) => String(c[0]))
    expect(paths[0]).toMatch(/^user-1\/\d{4}-\d{2}-\d{2}\/selfie-\d+\.jpeg$/)
    expect(paths[1]).toMatch(/^user-1\/\d{4}-\d{2}-\d{2}\/team-\d+\.png$/)
    expect(h.rpc).toHaveBeenLastCalledWith('contractor_checkin', { p_lat: 33.3, p_lng: 44.4, p_accuracy: 8, p_selfie_path: paths[0], p_team_photo_path: paths[1], p_headcount: 6 })
    expect(await contractors.signedUrl('c/p.jpg')).toBe('signed:c/p.jpg')
    expect(h.bucket.createSignedUrl).toHaveBeenCalledWith('c/p.jpg', 1800)
  })
})

describe('loginSupport — أفعال Edge Function وترجمة الأخطاء', () => {
  it('كل فعل يمرر اسمه وحقوله دون خلط بين رد الموظف ورد الدعم', async () => {
    const settings = { support_phone: '07', business_hours: '8-16', is_online: true }
    await loginSupport.getPublicSettings(); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'public_settings' } })
    await loginSupport.startRequest({ email: 'e@x.test', employee_number: '1', employee_name: 'علي', message: 'مساعدة' })
    expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'start_request', email: 'e@x.test', employee_number: '1', employee_name: 'علي', message: 'مساعدة' } })
    await loginSupport.loadThread('t', 'token'); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'load_thread', ticket_id: 't', token: 'token' } })
    await loginSupport.sendMessage('t', 'token', 'نص'); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'send_message', ticket_id: 't', token: 'token', message: 'نص' } })
    await loginSupport.listRequests(); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'list_requests' } })
    await loginSupport.getRequest('t'); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'get_request', ticket_id: 't' } })
    await loginSupport.reply('t', 'رد'); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'send_reply', ticket_id: 't', message: 'رد' } })
    await loginSupport.setStatus('t', 'resolved'); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'set_status', ticket_id: 't', status: 'resolved' } })
    await loginSupport.getSettings(); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'get_settings' } })
    await loginSupport.setSettings(settings); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'set_settings', ...settings } })
    await loginSupport.listLocks(); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'list_locks' } })
    await loginSupport.unlockEmail('e@x.test'); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'unlock_email', email: 'e@x.test' } })
    await loginSupport.lookupEmployee('e@x.test'); expect(h.invoke).toHaveBeenLastCalledWith('login-support', { body: { action: 'lookup_employee', email: 'e@x.test' } })
  })
  it('خطأ HTTP يحمل رمز الخادم، والاستجابة الفارغة خطأ صريح', async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'http', context: new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 }) } })
    await expect(loginSupport.getPublicSettings()).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'network', code: 'FORBIDDEN' } })
    await expect(loginSupport.listRequests()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    h.invoke.mockResolvedValueOnce({ data: null, error: null })
    await expect(loginSupport.listLocks()).rejects.toMatchObject({ code: 'LOGIN_SUPPORT_EMPTY' })
  })
})

describe('gpsHotspots — قراءة فقط من الملخص المحلي', () => {
  it('details لا يستدعي الشبكة لقائمة فارغة، وlist يحول الشهر والفلاتر كما يتوقع الخادم', async () => {
    expect(await gpsHotspots.details([])).toEqual([])
    expect(h.rpc).not.toHaveBeenCalled()
    await gpsHotspots.details([1, 2]); expect(h.rpc).toHaveBeenLastCalledWith('gps_hotspots_details', { p_ids: [1, 2] })
    await gpsHotspots.monthStats(); expect(h.rpc).toHaveBeenLastCalledWith('gps_hotspots_month_stats')
    await gpsHotspots.list()
    expect(h.rpc).toHaveBeenLastCalledWith('gps_hotspots_list', { p_month: null, p_classes: undefined, p_recurrence: null, p_min_vehicles: 1, p_sector_ids: null, p_details: true })
    await gpsHotspots.list({ month: '2026-11', classes: null, recurrence: ['frequent'], minVehicles: 2, sectorIds: [3], details: false })
    expect(h.rpc).toHaveBeenLastCalledWith('gps_hotspots_list', { p_month: '2026-11-01', p_classes: null, p_recurrence: ['frequent'], p_min_vehicles: 2, p_sector_ids: [3], p_details: false })
    await gpsHotspots.list({ month: '2026-11-15', sectorIds: [] })
    expect(lastArgs()).toMatchObject({ p_month: '2026-11-15', p_sector_ids: null })
    h.state.result = { data: null, error: null }
    expect(await gpsHotspots.monthStats()).toEqual([])
    expect(await gpsHotspots.details([1])).toEqual([])
    h.state.result = { data: null, error: { message: 'HOTSPOTS_DENIED' } }
    await expect(gpsHotspots.list()).rejects.toBeInstanceOf(LvnSyncError)
    await expect(gpsHotspots.monthStats()).rejects.toThrow('HOTSPOTS_DENIED')
    await expect(gpsHotspots.details([1])).rejects.toThrow('HOTSPOTS_DENIED')
  })
})

describe('platformReset — معاينة/طلبات ومسح ملفات على دفعات', () => {
  it('المعاينة لا تُفشل عند تعذر الجسر، والطلبات تمرر كلمة السر والفئات كما هي', async () => {
    h.warehouseRun.mockRejectedValueOnce(new Error('bridge down'))
    await platformReset.counts()
    expect(h.warehouseRun).toHaveBeenCalledWith('ping')
    expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_counts')
    await platformReset.closure(['attendance']); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_closure', { p_categories: ['attendance'] })
    await platformReset.request(['attendance'], 'تصفير'); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_request', { p_categories: ['attendance'], p_password: 'تصفير' })
    await platformReset.cancel('r'); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_cancel', { p_id: 'r' })
    await platformReset.approve('r', 'اعتماد تصفير'); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_approve', { p_id: 'r', p_password: 'اعتماد تصفير' })
    await platformReset.reject('r', 'سبب'); expect(h.rpc).toHaveBeenLastCalledWith('approval_decide_request', { p_kind: 'platform_reset', p_request: 'r', p_approve: false, p_note: 'سبب' })
    await platformReset.detail('r'); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_detail', { p_id: 'r' })
    await platformReset.list(); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_list', { p_limit: 50 })
    await platformReset.storageObjects('r'); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_storage_objects', { p_id: 'r', p_limit: 500 })
    await platformReset.storageFinish('r', 2); expect(h.rpc).toHaveBeenLastCalledWith('platform_reset_storage_finish', { p_id: 'r', p_deleted: 2 })
  })
  it('wipeStorage يجمع الحاويات، يتحدث بعد كل دفعة، ويتوقف عند حذف ناقص غير مكتمل', async () => {
    h.rpc.mockImplementation(async (fn: unknown) => {
      if (fn === 'platform_reset_storage_objects') return { data: [{ bucket_id: 'a', name: '1' }, { bucket_id: 'a', name: '2' }, { bucket_id: 'b', name: '3' }], error: null }
      if (fn === 'platform_reset_storage_finish') {
        const count = h.rpc.mock.calls.filter(([name]) => name === 'platform_reset_storage_finish').length
        return { data: { id: 'r', remaining: 3 - count, done: count === 2 }, error: null }
      }
      return { data: [], error: null }
    })
    h.bucket.remove.mockImplementation(async (names: unknown) => ({ data: (names as string[]).map((name) => ({ name })), error: null }))
    const progress: number[] = []
    expect(await platformReset.wipeStorage('r', (n) => progress.push(n))).toEqual({ deleted: 3, remaining: 0 })
    expect(h.bucket.remove).toHaveBeenCalledWith(['1', '2'])
    expect(h.bucket.remove).toHaveBeenCalledWith(['3'])
    expect(progress).toEqual([2, 3])
    // إشارة «انتهى» من الخادم توقف المسح فوراً، حتى لو أعاد التخزين عناصر في الدفعة التالية.
    expect(h.rpc.mock.calls.filter(([name]) => name === 'platform_reset_storage_objects')).toHaveLength(1)
    h.rpc.mockImplementation(async (fn: unknown) => fn === 'platform_reset_storage_objects' ? { data: [], error: null } : { data: { remaining: 0, done: true }, error: null })
    expect(await platformReset.wipeStorage('r')).toEqual({ deleted: 0, remaining: 0 })
    h.rpc.mockImplementation(async (fn: unknown) => fn === 'platform_reset_storage_objects' ? { data: [{ bucket_id: 'a', name: '1' }, { bucket_id: 'a', name: '2' }], error: null } : { data: { remaining: 1, done: false }, error: null })
    h.bucket.remove.mockResolvedValueOnce({ data: [{ name: '1' }], error: null })
    await expect(platformReset.wipeStorage('r')).rejects.toThrow('STORAGE_REMOVE_INCOMPLETE')
    h.bucket.remove.mockResolvedValueOnce({ data: null, error: { message: 'policy' } })
    await expect(platformReset.wipeStorage('r')).rejects.toThrow('STORAGE_REMOVE_FAILED')
  })
  it('wipeWarehouse يعيد خطأ الخادم المنظم ولا يبتلع فشل الشبكة', async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, result: { deleted: 2 } }, error: null })
    expect(await platformReset.wipeWarehouse('r')).toEqual({ ok: true, result: { deleted: 2 } })
    expect(h.invoke).toHaveBeenCalledWith('gps-warehouse', { body: { action: 'wipe', reset_id: 'r' } })
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'http', context: new Response(JSON.stringify({ error: 'RESET_NOT_APPROVED' })) } })
    expect(await platformReset.wipeWarehouse('r')).toEqual({ ok: false, error: 'RESET_NOT_APPROVED' })
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'network' } })
    expect(await platformReset.wipeWarehouse('r')).toEqual({ ok: false, error: 'network' })
    h.invoke.mockResolvedValueOnce({ data: null, error: null })
    expect(await platformReset.wipeWarehouse('r')).toEqual({ ok: false, error: 'EMPTY' })
  })
})
