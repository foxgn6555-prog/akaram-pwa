import { describe, expect, it, vi } from 'vitest'
import { runWarehouseReset, type WarehouseResetDeps } from '../../../supabase/functions/_shared/platform-reset-warehouse'
const id = '98600000-0000-0000-0000-000000000001'
const actor = { id: 'u', roles: ['it_admin'], scheduler: false }
function deps(): WarehouseResetDeps {
  return { claim: vi.fn().mockResolvedValue({ done: false, token: 'token', wipe_data: true, reset_settings: false }), finish: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ state: 'prepared' }), files: vi.fn().mockResolvedValueOnce([{ name: '2026/01/a.gz' }]).mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(1), execute: vi.fn().mockResolvedValue({ rows_deleted: 5 }), now: () => 1 }
}
describe('مسح مستودع GPS مرتبط بالطلب', () => {
  it('يرفض غير المصرح والمجدول ورقم الطلب الخاطئ قبل أي مسح', async () => {
    const d = deps()
    await expect(runWarehouseReset({ ...actor, id: null }, id, d)).rejects.toThrow('FORBIDDEN')
    await expect(runWarehouseReset({ ...actor, scheduler: true }, id, d)).rejects.toThrow('FORBIDDEN')
    await expect(runWarehouseReset(actor, undefined, d)).rejects.toThrow('ID_REQUIRED')
    expect(d.claim).not.toHaveBeenCalled()
  })
  it('يرفض أي مستخدم لم تأذن له قاعدة البيانات بالطلب ولا يلمس المستودع', async () => {
    const d = deps(); vi.mocked(d.claim).mockRejectedValue(new Error('GPS_WAREHOUSE_RESET_NOT_AUTHORIZED'))
    await expect(runWarehouseReset({ ...actor, roles: ['ops_room'] }, id, d)).rejects.toThrow('NOT_AUTHORIZED')
    expect(d.prepare).not.toHaveBeenCalled(); expect(d.remove).not.toHaveBeenCalled(); expect(d.execute).not.toHaveBeenCalled()
  })
  it('يمسح ملفات اللقطة فقط قبل تنفيذ قاعدة المستودع ويحفظ النتيجة', async () => {
    const d = deps()
    expect(await runWarehouseReset(actor, id, d)).toEqual({ rows_deleted: 5 })
    expect(d.prepare).toHaveBeenCalledWith(id, true, false)
    expect(d.remove).toHaveBeenCalledWith(['2026/01/a.gz'])
    expect(d.finish).toHaveBeenCalledWith(id, 'token', true, { rows_deleted: 5 })
  })
  it('يترك العملية قابلة للإعادة ولا ينفذ حذف الجداول عند فشل الملفات', async () => {
    const d = deps(); vi.mocked(d.remove).mockResolvedValue(0)
    await expect(runWarehouseReset(actor, id, d)).rejects.toThrow('STORAGE_INCOMPLETE')
    expect(d.execute).not.toHaveBeenCalled()
    expect(d.finish).toHaveBeenCalledWith(id, 'token', false, null)
  })
  it('لا يكرر الحذف عند إعادة الطلب بعد اكتماله', async () => {
    const d = deps(); vi.mocked(d.claim).mockResolvedValue({ done: true, result: { rows_deleted: 3 } })
    expect(await runWarehouseReset(actor, id, d)).toEqual({ rows_deleted: 3 })
    expect(d.prepare).not.toHaveBeenCalled(); expect(d.remove).not.toHaveBeenCalled(); expect(d.execute).not.toHaveBeenCalled()
  })
})
