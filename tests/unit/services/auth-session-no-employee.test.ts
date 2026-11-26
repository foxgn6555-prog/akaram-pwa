/**
 * عطل الإنتاج (2026-11-26): «لم تُعد العملية أي بيانات / SDKError» عند فتح
 * التطبيق — شاشة خطأ بدل تسجيل الدخول.
 *
 * ## السبب
 * `buildSessionUser` كان يقرأ الاسم الكامل بـ `sdkGuard(...maybeSingle())`.
 * و`maybeSingle` تُرجع `data: null` **بلا خطأ** حين لا يوجد صفّ — نتيجة
 * مشروعة. لكن `sdkGuard` يرفض `null` ويُطلق `EMPTY_RESULT`. فحساب بلا صفّ
 * في `employees` (حساب إداري/متعاقد/مدير نظام غير مربوط بموظف) ينفجر عنده
 * بناء الجلسة **كله**: لا أدوار، لا بوابة، لا تطبيق.
 *
 * ## ما يثبّته هذا الملف
 * ① حساب بلا صفّ موظف ⇒ جلسة صحيحة، `fullName = null`.
 * ② الأدوار تُقرأ رغم غياب صفّ الموظف (لا تُسقط معه).
 * ③ خطأ حقيقي في قراءة الاسم أو الأدوار **لا يُبتلع** (نُبقي صدق الأخطاء).
 * ④ حساب بلا أدوار ⇒ `employee` افتراضياً، بلا انفجار.
 *
 * الاختبار يستخدم `sdkGuard`/`sdkMaybe` الحقيقيين — العطل كان في تفاعلهما،
 * فمحاكاة أغلبهما كانت ستُخفي العيب بدل كشفه. `supabase` وحده مُستبدل.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  employeesRow: null as { full_name: string } | null,
  employeesError: null as { message: string; code?: string } | null,
  roles: [] as Array<{ role: string }>,
  rolesError: null as { message: string; code?: string } | null,
}))

vi.mock('@sdk/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    supabase: {
      from: (table: string) => {
        const result =
          table === 'employees'
            ? { data: h.employeesRow, error: h.employeesError }
            : { data: h.roles, error: h.rolesError }
        const chain: Record<string, unknown> = {}
        for (const method of ['select', 'eq', 'maybeSingle']) {
          chain[method] = vi.fn(() => chain)
        }
        // يُستهلك الاستعلام عند `await`
        chain.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result).then(resolve)
        return chain
      },
    },
  }
})

import { auth } from '@sdk/auth.sdk'

describe('بناء الجلسة — حساب بلا صفّ موظف لا يُسقط التطبيق', () => {
  beforeEach(() => {
    h.employeesRow = null
    h.employeesError = null
    h.roles = [{ role: 'employee' }]
    h.rolesError = null
  })

  it('★ يبني الجلسة بنجاح حين لا يوجد صفّ في employees (عطل الإنتاج)', async () => {
    const user = await auth.buildSessionUser('u-1', 'admin@test.iq')
    expect(user).toMatchObject({
      id: 'u-1',
      email: 'admin@test.iq',
      fullName: null,
      roles: ['employee'],
      primaryRole: 'employee',
    })
  })

  it('يقرأ الأدوار كما هي رغم غياب صفّ الموظف', async () => {
    h.roles = [{ role: 'super_admin' }, { role: 'it_admin' }]
    const user = await auth.buildSessionUser('u-2', null)
    expect(user.roles).toEqual(['super_admin', 'it_admin'])
    // ROLE_PRIORITY يرتّب it_admin قبل super_admin — الأولوية للترتيب لا لترتيب الصفوف
    expect(user.primaryRole).toBe('it_admin')
  })

  it('يعرض الاسم الكامل حين يوجد الصفّ', async () => {
    h.employeesRow = { full_name: 'علي حسن' }
    const user = await auth.buildSessionUser('u-3', 'a@b.test')
    expect(user.fullName).toBe('علي حسن')
  })

  it('حساب بلا أي دور ⇒ employee افتراضياً، بلا انفجار', async () => {
    h.roles = []
    const user = await auth.buildSessionUser('u-4', null)
    expect(user.roles).toEqual([])
    expect(user.primaryRole).toBe('employee')
  })

  it('خطأ حقيقي في قراءة الاسم لا يُبتلع', async () => {
    h.employeesError = { message: 'network down', code: 'NETWORK' }
    await expect(auth.buildSessionUser('u-5', null)).rejects.toThrow()
  })

  it('خطأ حقيقي في قراءة الأدوار لا يُبتلع', async () => {
    h.rolesError = { message: 'permission denied', code: '42501' }
    await expect(auth.buildSessionUser('u-6', null)).rejects.toThrow()
  })
})
