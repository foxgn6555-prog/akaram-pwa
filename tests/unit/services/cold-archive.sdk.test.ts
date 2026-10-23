/** SDK الأرشيف البارد (00317): تنفيذ الحذف دفعات — لا يُعدّ الملف محذوفاً إلا إن حُذف فعلاً أو ثبت غيابه */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), exists: vi.fn() }))
vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { rpc: h.rpc, storage: { from: () => ({ remove: h.remove, exists: h.exists }) } },
    async sdkGuard(op: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
      const { data, error } = await op
      if (error) throw new SDKError(error.message, 'X', error)
      if (data === null || data === undefined) throw new SDKError('لا بيانات', 'EMPTY')
      return data
    },
  }
})
import { coldArchive, coldErrorMessage } from '@sdk/cold-archive.sdk'

const item = (id: number, path: string, status = 'downloaded') => ({ id, bucket: 'media-photos', storage_path: path, status })

describe('coldArchive.purgeRun', () => {
  beforeEach(() => vi.clearAllMocks())

  it('يبدأ ثم يحذف دفعات ويؤكد ما حُذف فعلاً فقط؛ الملف غير الموجود أصلاً يُعدّ محذوفاً، والمحجوب يبقى معلّقاً', async () => {
    let purged = 0
    h.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'cold_archive_purge_begin') return { data: { id: 'p1', code: 'PKG', status: 'purging', file_count: 3, purged_count: 0 }, error: null }
      if (fn === 'cold_archive_items_list') return { data: args.p_after ? [] : [item(1, 'a.jpg'), item(2, 'gone.jpg'), item(3, 'blocked.jpg'), item(4, 'old.jpg', 'purged')], error: null }
      if (fn === 'cold_archive_purge_confirm') { purged += (args.p_removed as unknown[]).length; return { data: { id: 'p1', code: 'PKG', status: purged >= 3 ? 'purged' : 'purging', file_count: 3, purged_count: purged }, error: null } }
      return { data: null, error: { message: 'unexpected ' + fn } }
    })
    h.remove.mockResolvedValue({ data: [{ name: 'a.jpg' }], error: null })
    h.exists.mockImplementation(async (p: string) => ({ data: p !== 'gone.jpg', error: null }))
    const progress: number[] = []
    const r = await coldArchive.purgeRun('p1', (d) => progress.push(d))
    expect(h.remove).toHaveBeenCalledWith(['a.jpg', 'gone.jpg', 'blocked.jpg'])   // الملف المحذوف سابقاً لا يُعاد إرساله
    const confirm = h.rpc.mock.calls.find((c) => c[0] === 'cold_archive_purge_confirm')
    expect(confirm?.[1]).toEqual({ p_package: 'p1', p_removed: [{ bucket: 'media-photos', path: 'a.jpg' }, { bucket: 'media-photos', path: 'gone.jpg' }] })
    expect(r.status).toBe('purging')   // blocked.jpg ما زال معلّقاً → الحزمة لم تكتمل
    expect(progress).toEqual([2])
  })

  it('خطأ التخزين يوقف التنفيذ برسالة واضحة ولا يؤكد شيئاً', async () => {
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'cold_archive_purge_begin') return { data: { id: 'p1', status: 'purging', file_count: 1, purged_count: 0 }, error: null }
      if (fn === 'cold_archive_items_list') return { data: [item(1, 'a.jpg')], error: null }
      return { data: null, error: { message: 'unexpected ' + fn } }
    })
    h.remove.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(coldArchive.purgeRun('p1')).rejects.toThrow('فشل حذف ملفات من media-photos: permission denied')
    expect(h.rpc.mock.calls.some((c) => c[0] === 'cold_archive_purge_confirm')).toBe(false)
  })

  it('رسائل الأخطاء الجديدة مترجمة', () => {
    expect(coldErrorMessage(new Error('COLD_ARCHIVE_APPROVAL_REQUIRED'))).toContain('موافقة أولاً')
    expect(coldErrorMessage(new Error('COLD_ARCHIVE_CHAIN_ACTIVE'))).toContain('سلسلة موافقات')
    expect(coldErrorMessage(new Error('COLD_ARCHIVE_SAME_APPROVER'))).toContain('حساب IT آخر')
    expect(coldErrorMessage(new Error('COLD_ARCHIVE_GRACE_ACTIVE'))).toBe('مهلة الأمان لم تنتهِ بعد')
  })
})
