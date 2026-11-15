/** عقود الأرشيف والكشوفات القديمة وجسر مستودع GPS — بلا اتصال بقاعدة الإنتاج. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { result: { data: [] as unknown, error: null as null | { message: string; code?: string } } }
  const queries: Array<{ table: string; calls: Array<[string, unknown[]]> }> = []
  const chain = (table: string) => {
    const calls: Array<[string, unknown[]]> = []
    queries.push({ table, calls })
    const c: Record<string, unknown> = {}
    for (const method of ['select', 'is', 'not', 'eq', 'order', 'insert', 'update', 'single', 'maybeSingle', 'returns']) c[method] = vi.fn((...args: unknown[]) => { calls.push([method, args]); return c })
    c.then = (resolve: (v: typeof state.result) => unknown) => Promise.resolve(state.result).then(resolve)
    return c
  }
  return {
    state, queries, from: vi.fn(chain), rpc: vi.fn(async (..._args: unknown[]) => state.result),
    invoke: vi.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: null | { message?: string; context?: Response } }> => ({ data: { ok: true, action: 'ping' }, error: null })),
    guard: vi.fn(async (value: PromiseLike<{ data: unknown; error: null | { message: string; code?: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data }),
    voidGuard: vi.fn(async (value: PromiseLike<{ error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message) }),
  }
})
vi.mock('@sdk/client', () => ({ supabase: { from: h.from, rpc: h.rpc, functions: { invoke: h.invoke } }, sdkGuard: h.guard, sdkVoid: h.voidGuard }))
import { archive } from '@sdk/archive.sdk'
import { disclosures } from '@sdk/disclosures.sdk'
import { gpsWarehouse } from '@sdk/gps-warehouse.sdk'
import { SDKError } from '@lib/errors/SDKError'
import { LvnSyncError } from '@sdk/gps-lvn.sdk'

const lastQuery = () => h.queries.at(-1)!
const arg = (method: string) => lastQuery().calls.find(([name]) => name === method)?.[1]
beforeEach(() => {
  h.state.result = { data: [], error: null }; h.queries.length = 0
  h.from.mockClear(); h.rpc.mockClear(); h.invoke.mockClear(); h.guard.mockClear(); h.voidGuard.mockClear()
  h.invoke.mockResolvedValue({ data: { ok: true, action: 'ping' }, error: null })
})

describe('archive — قوائم المؤرشف والاستعادة', () => {
  it('كل جدول معروف يختار أعمدته الصحيحة، والجدول غير المعروف يستخدم الأعمدة العامة', async () => {
    const columns: Record<string, string> = {
      employees: 'id, full_name, employee_number, archived_at, archive_reason',
      departments: 'id, name, archived_at, archive_reason',
      branches: 'id, name, code, archived_at, archive_reason',
      biometric_devices: 'id, name, serial_number, archived_at, archive_reason',
      vehicles: 'id, name, plate, archived_at, archive_reason',
      dynamic_portals: 'id, name, slug, archived_at, archive_reason',
      other: 'id, name, archived_at, archive_reason',
    }
    for (const [table, select] of Object.entries(columns)) {
      expect(await archive.listTable(table)).toEqual([])
      expect(h.from).toHaveBeenLastCalledWith(table)
      expect(arg('select')).toEqual([select])
      expect(arg('not')).toEqual(['archived_at', 'is', null])
      expect(arg('order')).toEqual(['archived_at', { ascending: false }])
    }
  })
  it('يوحد اسم الموظف/السجل والحقول الاختيارية، ولا يخترع سبباً للأرشفة', async () => {
    h.state.result = { data: [{ id: 1, full_name: 'علي', employee_number: 'E1' }, { id: 2, name: 'قسم', code: 'D', archived_at: 'a', archive_reason: 'سبب' }], error: null }
    expect(await archive.listTable('employees')).toEqual([
      { id: '1', name: 'علي', table: 'employees', archived_at: '', archive_reason: null, code: null, employee_number: 'E1' },
      { id: '2', name: 'قسم', table: 'employees', archived_at: 'a', archive_reason: 'سبب', code: 'D', employee_number: null },
    ])
    h.state.result = { data: null, error: null }
    expect(await archive.listTable('departments')).toEqual([])
    h.state.result = { data: null, error: { message: 'ARCHIVE_DENIED' } }
    await expect(archive.listTable('departments')).rejects.toThrow('ARCHIVE_DENIED')
  })
  it('العدادات والاستعادة والأرشفة تمرر الجدول والمعرف والسبب إلى RPC الصحيح', async () => {
    h.state.result = { data: [{ table: 'employees', count: 2 }], error: null }
    expect(await archive.counts()).toEqual([{ table: 'employees', count: 2 }])
    expect(h.rpc).toHaveBeenLastCalledWith('archive_counts')
    await archive.restore('employees', 'e1')
    expect(h.rpc).toHaveBeenLastCalledWith('archive_restore', { p_table: 'employees', p_id: 'e1' })
    await archive.archive('employees', 'e1', 'سبب')
    expect(h.rpc).toHaveBeenLastCalledWith('archive_record', { p_table: 'employees', p_id: 'e1', p_reason: 'سبب' })
    h.state.result = { data: null, error: { message: 'IT_FORBIDDEN' } }
    await expect(archive.restore('employees', 'e1')).rejects.toThrow('IT_FORBIDDEN')
    await expect(archive.archive('employees', 'e1', 'سبب')).rejects.toThrow('IT_FORBIDDEN')
  })
})

describe('disclosures — الكشوفات القديمة المتوافقة مع الواجهة', () => {
  const input = { db_number: 'DB1', driver_name: 'علي', shift: 'morning', log_date: '2026-11-01', violation_type: 'delay' as const, details: 'تأخير' }
  it('النشط والمؤرشف يفترقان في الفلتر والترتيب، والقيم الغائبة لها افتراضات ثابتة', async () => {
    h.state.result = { data: [{ id: 'd1' }, { id: 'd2', ref_no: 'R', db_number: 'DB', driver_name: 'علي', vehicle_type: 'كابسة', contractor_name: 'متعهد', sector: 'الوليد', shift: 'night', log_date: '2026-11-01', violation_type: 'absence', penalty_type: 'fine', details: 'تفاصيل', status: 'submitted_to_deputy', submitted_at: 's', prepared_by_name: 'معد', archived_at: 'a', archived_by: 'u', archive_reason: 'سبب', created_by: 'c', created_at: 't' }], error: null }
    const rows = await disclosures.list()
    expect(h.from).toHaveBeenCalledWith('disclosures')
    expect(arg('is')).toEqual(['archived_at', null])
    expect(arg('order')).toEqual(['created_at', { ascending: false }])
    expect(rows[0]).toMatchObject({ id: 'd1', ref_no: null, db_number: '', driver_name: '', shift: 'morning', violation_type: 'delay', penalty_type: null, status: 'draft', archive_reason: null })
    expect(rows[1]).toMatchObject({ id: 'd2', shift: 'night', violation_type: 'absence', penalty_type: 'fine', status: 'submitted_to_deputy', archive_reason: 'سبب' })
    await disclosures.listArchived()
    expect(arg('not')).toEqual(['archived_at', 'is', null])
    expect(arg('order')).toEqual(['archived_at', { ascending: false }])
    h.state.result = { data: null, error: null }
    expect(await disclosures.list()).toEqual([])
    expect(await disclosures.listArchived()).toEqual([])
  })
  it('byId يعيد null للنتيجة الفارغة فقط، ولا يبتلع رفض الصلاحيات', async () => {
    h.state.result = { data: { id: 'd1', db_number: 'DB' }, error: null }
    expect(await disclosures.byId('d1')).toMatchObject({ id: 'd1', db_number: 'DB', status: 'draft' })
    expect(arg('eq')).toEqual(['id', 'd1'])
    expect(arg('is')).toEqual(['archived_at', null])
    h.guard.mockRejectedValueOnce(new SDKError('فارغ', 'EMPTY_RESULT'))
    expect(await disclosures.byId('missing')).toBeNull()
    h.guard.mockRejectedValueOnce(new SDKError('مرفوض', '42501'))
    await expect(disclosures.byId('d1')).rejects.toThrow('مرفوض')
  })
  it('الإنشاء والتعديل والأرشفة والاستعادة والملخص يحافظان على المدخلات والأخطاء', async () => {
    h.state.result = { data: { id: 'd1', ...input }, error: null }
    expect(await disclosures.create(input)).toMatchObject({ id: 'd1', db_number: 'DB1', driver_name: 'علي' })
    expect(arg('insert')).toEqual([input])
    await disclosures.update('d1', { details: 'تحديث' })
    expect(arg('update')).toEqual([{ details: 'تحديث' }])
    expect(arg('eq')).toEqual(['id', 'd1'])
    await disclosures.archive('d1', 'سبب')
    expect(h.rpc).toHaveBeenLastCalledWith('disclosure_archive', { p_id: 'd1', p_reason: 'سبب' })
    await disclosures.restore('d1')
    expect(h.rpc).toHaveBeenLastCalledWith('disclosure_restore', { p_id: 'd1' })
    h.state.result = { data: null, error: null }
    expect(await disclosures.summary()).toEqual({})
    h.state.result = { data: null, error: { message: 'DISCLOSURE_FORBIDDEN' } }
    await expect(disclosures.summary()).rejects.toThrow('DISCLOSURE_FORBIDDEN')
    await expect(disclosures.archive('d1', 'سبب')).rejects.toThrow('DISCLOSURE_FORBIDDEN')
  })
})

describe('gpsWarehouse — الجسر لا يتصل بالمستودع مباشرة', () => {
  it('link يقرأ حالة المشروع الأول، وrun يمرر الفعل وخياراته إلى دالة الحافة', async () => {
    h.state.result = { data: { id: 1, warehouse_host: 'private-host' }, error: null }
    expect(await gpsWarehouse.link()).toMatchObject({ id: 1, warehouse_host: 'private-host' })
    expect(h.rpc).toHaveBeenCalledWith('gps_warehouse_link_get')
    expect(await gpsWarehouse.run('ping')).toEqual({ ok: true, action: 'ping' })
    expect(h.invoke).toHaveBeenLastCalledWith('gps-warehouse', { body: { action: 'ping' } })
    await gpsWarehouse.run('enqueue_month', { month: '2026-11', limit: 2 })
    expect(h.invoke).toHaveBeenLastCalledWith('gps-warehouse', { body: { action: 'enqueue_month', month: '2026-11', limit: 2 } })
    h.state.result = { data: null, error: { message: 'LINK_DENIED' } }
    await expect(gpsWarehouse.link()).rejects.toBeInstanceOf(LvnSyncError)
  })
  it('يفشل عند ok=false أو رد فارغ، ويحفظ رمز الخادم من JSON أو رسالة الشبكة', async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: false, error: 'WAREHOUSE_PAUSED' }, error: null })
    await expect(gpsWarehouse.run('pull')).rejects.toThrow('WAREHOUSE_PAUSED')
    h.invoke.mockResolvedValueOnce({ data: null, error: null })
    await expect(gpsWarehouse.run('ping')).rejects.toThrow('GPS_WAREHOUSE_FAILED')
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'http', context: new Response(JSON.stringify({ error: 'RESET_NOT_APPROVED' })) } })
    await expect(gpsWarehouse.run('wipe')).rejects.toThrow('RESET_NOT_APPROVED')
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'network', context: new Response('not-json') } })
    await expect(gpsWarehouse.run('ping')).rejects.toThrow('network')
    h.invoke.mockResolvedValueOnce({ data: null, error: {} })
    await expect(gpsWarehouse.run('ping')).rejects.toThrow('GPS_WAREHOUSE_FAILED')
  })
})
