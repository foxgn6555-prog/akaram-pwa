/** 00350 — SDK الصلاحيات: القراءة عبر الجداول، الكتابة عبر RPC، الدوال الفارغة عبر sdkVoid، وخريطة الأخطاء العربية */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }))

vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { from: fromMock, rpc: rpcMock, auth: { getSession: vi.fn() } },
    isNetworkError: (e: unknown) => e instanceof TypeError,
    async sdkGuard(op: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
      const { data, error } = await op
      if (error) throw new SDKError(error.message, 'X', error)
      if (data === null || data === undefined) throw new SDKError('لا بيانات', 'EMPTY')
      return data
    },
    async sdkVoid(op: PromiseLike<{ error?: { message: string } | null }>) {
      const { error } = await op
      if (error) throw new SDKError(error.message, 'X', error)
    },
  }
})

import { permissionErrorMessage, permissions } from '@sdk/permissions.sdk'

const chain = (data: unknown) => {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) c[m] = () => c
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res)
  return c
}

describe('permissions.sdk', () => {
  beforeEach(() => { fromMock.mockReset(); rpcMock.mockReset() })

  it('الدوال الفارغة (إسناد قالب/استثناء/حذف) لا ترمي «لا بيانات» عند data=null', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await expect(permissions.userTemplateSet('u1', null)).resolves.toBeUndefined()
    await expect(permissions.userOverrideSet('u1', 'hr.leaves', 'view', 'deny', 'سبب')).resolves.toBeUndefined()
    await expect(permissions.templateDelete('t1')).resolves.toBeUndefined()
    expect(rpcMock).toHaveBeenCalledWith('it_user_permission_override_set', { p_user: 'u1', p_unit: 'hr.leaves', p_action: 'view', p_effect: 'deny', p_reason: 'سبب' })
  })

  it('قالب المستخدم: لا صف ⇒ null (بلا خطأ)', async () => {
    fromMock.mockReturnValue(chain([]))
    await expect(permissions.userTemplate('u1')).resolves.toBeNull()
    fromMock.mockReturnValue(chain([{ user_id: 'u1', template_id: 't1', assigned_at: 'x' }]))
    await expect(permissions.userTemplate('u1')).resolves.toMatchObject({ template_id: 't1' })
  })

  it('القوالب تُرجع عدد المستخدمين المسنَدين', async () => {
    fromMock.mockReturnValue(chain([{ id: 't1', name: 'أ', description: null, is_active: true, created_at: 'x', updated_at: 'x', user_permission_template: [{ count: 3 }] }]))
    const t = await permissions.templates()
    expect(t[0]).toMatchObject({ id: 't1', users_count: 3 })
    expect('user_permission_template' in t[0]!).toBe(false)
  })

  it('حفظ القالب يمرّر jsonb ويعيد المعرّف؛ رسائل الأخطاء عربية', async () => {
    rpcMock.mockResolvedValue({ data: 't9', error: null })
    await expect(permissions.templateSave({ name: 'جديد' })).resolves.toBe('t9')
    expect(rpcMock).toHaveBeenCalledWith('it_permission_template_save', { p: { name: 'جديد' } })
    expect(permissionErrorMessage(new Error('PERMISSION_TEMPLATE_IN_USE'))).toMatch(/مسنَد إلى مستخدمين/)
    expect(permissionErrorMessage(new Error('PERMISSION_SELF_EDIT'))).toMatch(/حسابك/)
    expect(permissionErrorMessage(new Error('duplicate key value'))).toMatch(/بهذا الاسم/)
  })
})
